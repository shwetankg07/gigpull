import { describe, it, expect } from "vitest";
import { openDb, companies, scores, leads } from "../src/db/index.js";
import { runPipeline } from "../src/pipeline.js";
import { loadConfig } from "../src/config.js";
import type { Collector } from "../src/collect/types.js";
import type { LlmClient } from "../src/llm/client.js";

const fakeCollector: Collector = {
  name: "fake", mode: "local",
  async *run() {
    yield {
      mode: "local", identityKey: "place:1", name: "Anand Sweets",
      website: null, city: "Indiranagar", category: "sweet_shop",
      source: "fake", signals: [
        { kind: "rating", value: 4.5 },
        { kind: "review_count", value: 892 },
        { kind: "has_website", value: false },
        { kind: "runs_ads", value: true },
      ],
      contacts: [{ type: "phone", value: "+919845012345" }],
    };
    yield {
      mode: "local", identityKey: "place:2", name: "City Tax Office",
      website: null, city: "Indiranagar", category: "local_government_office",
      source: "fake", signals: [
        { kind: "review_count", value: 400 },
        { kind: "has_website", value: false },
      ],
      contacts: [],
    };
  },
};

const dropGovernment: LlmClient = {
  async complete(prompt: string) {
    return prompt.includes("City Tax Office")
      ? { verdict: "drop", reason: "Government office", adjustment: 0 }
      : { verdict: "keep", reason: "Real business", adjustment: 5 };
  },
};

const opts = {
  config: loadConfig({} as NodeJS.ProcessEnv),
  collectors: [fakeCollector],
  llm: dropGovernment,
  now: new Date("2026-08-16T00:00:00Z"),
  skipWebProbe: true,
};

describe("runPipeline", () => {
  it("collects, dedupes, scores and creates leads", async () => {
    const db = openDb(":memory:");
    const summary = await runPipeline(db, opts);
    expect(summary.collected).toBe(2);
    expect(summary.created).toBe(2);
    expect(db.select().from(companies).all()).toHaveLength(2);
    expect(db.select().from(scores).all()).toHaveLength(2);
  });

  it("drops the lead the rerank rejects but keeps its reason", async () => {
    const db = openDb(":memory:");
    const summary = await runPipeline(db, opts);
    expect(summary.dropped).toBe(1);
    const rows = db.select().from(scores).all();
    const dropped = rows.find((r) => r.rerankVerdict === "drop")!;
    expect(dropped.rerankReason).toContain("Government office");
  });

  it("is idempotent — a second run merges instead of duplicating", async () => {
    const db = openDb(":memory:");
    await runPipeline(db, opts);
    const second = await runPipeline(db, opts);
    expect(second.created).toBe(0);
    expect(second.merged).toBe(2);
    expect(db.select().from(companies).all()).toHaveLength(2);
  });

  it("proceeds on deterministic scores when the rerank is unavailable", async () => {
    const db = openDb(":memory:");
    const failing: LlmClient = { complete: async () => { throw new Error("no key"); } };
    const summary = await runPipeline(db, { ...opts, llm: failing });
    expect(summary.rerankAvailable).toBe(false);
    expect(summary.scored).toBe(2);
    expect(db.select().from(scores).all()).toHaveLength(2);
  });

  it("writes a brief onto every surviving lead", async () => {
    const db = openDb(":memory:");
    await runPipeline(db, opts);
    const kept = db.select().from(leads).all().filter((l) => l.status !== "dead");
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0]!.briefMd).toContain("Anand Sweets");
  });
});
