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
  sleep: async () => {},
};

const startupCollector: Collector = {
  name: "fake-startup", mode: "startup",
  async *run() {
    yield {
      mode: "startup", identityKey: "domain:kolo.example", name: "Kolo",
      website: "https://kolo.example", city: null, category: "seed",
      source: "fake", signals: [
        { kind: "funded_within_180d", value: true },
        { kind: "github_org", value: "kolo-hq" },
        { kind: "has_website", value: true },
      ],
      contacts: [{ type: "email", value: "arjun@kolo.example" }],
    };
  },
};

describe("chain filter", () => {
  const withChain: Collector = {
    name: "chains", mode: "local",
    async *run() {
      for (const [key, name] of [
        ["place:kfc", "KFC Indiranagar"],
        ["place:ccd", "Cafe Coffee Day, Koramangala"],
        ["place:indie", "Burma Burma Restaurant & Tea Room"],
      ] as const) {
        yield {
          mode: "local", identityKey: key, name, website: null,
          city: "Bangalore", category: "restaurant", source: "fake",
          signals: [{ kind: "has_website", value: false }],
          contacts: [{ type: "phone", value: "080 00000000" }],
        };
      }
    },
  };

  it("kills chains before they consume rerank slots", async () => {
    const db = openDb(":memory:");
    let rerankCalls = 0;
    const counting: LlmClient = {
      async complete() {
        rerankCalls += 1;
        return { verdict: "keep", reason: "ok", adjustment: 0, fit: null };
      },
    };
    const summary = await runPipeline(db, {
      ...opts, collectors: [withChain], llm: counting, profile: null,
    });

    expect(summary.chainsFiltered).toBe(2);
    // Only the independent business should have cost an LLM call.
    expect(rerankCalls).toBe(1);
  });

  it("marks filtered chains dead so they never resurface in the list", async () => {
    const db = openDb(":memory:");
    await runPipeline(db, { ...opts, collectors: [withChain], profile: null });
    const dead = db.select().from(leads).all().filter((l) => l.status === "dead");
    expect(dead).toHaveLength(2);
  });
});

describe("startup mode", () => {
  it("probes the github org when a company advertises one", async () => {
    const db = openDb(":memory:");
    const probed: string[] = [];
    await runPipeline(db, {
      ...opts,
      collectors: [startupCollector],
      probeGithub: async (org) => {
        probed.push(org);
        return {
          ok: true, defects: ["stalled_repo", "issue_backlog"],
          openIssues: 140, daysSinceLastCommit: 200, hasCi: true,
        };
      },
    });
    expect(probed).toEqual(["kolo-hq"]);
  });

  it("feeds github defects into the score's gap axis", async () => {
    const db = openDb(":memory:");
    await runPipeline(db, {
      ...opts,
      collectors: [startupCollector],
      probeGithub: async () => ({
        ok: true, defects: ["stalled_repo", "issue_backlog", "no_ci"],
        openIssues: 140, daysSinceLastCommit: 200, hasCi: false,
      }),
    });
    const row = db.select().from(scores).all()[0]!;
    const breakdown = JSON.parse(row.breakdownJson) as Record<string, number>;
    expect(breakdown.gap).toBeGreaterThan(0);
  });

  it("skips the github probe when no org is known", async () => {
    const db = openDb(":memory:");
    let called = 0;
    const noOrg: Collector = {
      name: "no-org", mode: "startup",
      async *run() {
        yield {
          mode: "startup", identityKey: "domain:x.example", name: "X",
          website: "https://x.example", city: null, category: null, source: "f",
          signals: [{ kind: "funded_within_180d", value: true }], contacts: [],
        };
      },
    };
    await runPipeline(db, {
      ...opts, collectors: [noOrg],
      probeGithub: async () => { called += 1; return null as never; },
    });
    expect(called).toBe(0);
  });
});

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
