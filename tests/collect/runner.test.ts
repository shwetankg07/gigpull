import { describe, it, expect } from "vitest";
import { openDb, runs } from "../../src/db/index.js";
import { runCollectors } from "../../src/collect/runner.js";
import type { Collector } from "../../src/collect/types.js";
import { loadConfig } from "../../src/config.js";

const ctx = { now: new Date("2026-08-16T00:00:00Z"), config: loadConfig({} as NodeJS.ProcessEnv) };

const good: Collector = {
  name: "good", mode: "local",
  async *run() {
    yield { mode: "local", identityKey: "place:1", name: "A", source: "good", signals: [], contacts: [] };
  },
};

const bad: Collector = {
  name: "bad", mode: "local",
  // eslint-disable-next-line require-yield
  async *run() { throw new Error("source rotted"); },
};

describe("runCollectors", () => {
  it("collects candidates from a working collector", async () => {
    const db = openDb(":memory:");
    const out = await runCollectors(db, [good], ctx);
    expect(out[0]!.ok).toBe(true);
    expect(out[0]!.candidates).toHaveLength(1);
  });

  it("isolates a failing collector without aborting the run", async () => {
    const db = openDb(":memory:");
    const out = await runCollectors(db, [bad, good], ctx);
    expect(out.find((o) => o.collector === "bad")!.ok).toBe(false);
    expect(out.find((o) => o.collector === "bad")!.error).toContain("source rotted");
    expect(out.find((o) => o.collector === "good")!.candidates).toHaveLength(1);
  });

  it("writes one runs row per collector", async () => {
    const db = openDb(":memory:");
    await runCollectors(db, [bad, good], ctx);
    const rows = db.select().from(runs).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.collector === "bad")!.ok).toBe(false);
    expect(rows.find((r) => r.collector === "good")!.itemCount).toBe(1);
  });

  it("rejects a candidate that fails schema validation", async () => {
    const db = openDb(":memory:");
    const malformed: Collector = {
      name: "malformed", mode: "local",
      async *run() { yield { mode: "local", name: "" } as never; },
    };
    const out = await runCollectors(db, [malformed], ctx);
    expect(out[0]!.ok).toBe(false);
  });
});
