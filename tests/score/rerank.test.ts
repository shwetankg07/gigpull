import { describe, it, expect } from "vitest";
import { rerank } from "../../src/score/rerank.js";
import type { LlmClient } from "../../src/llm/client.js";

const input = {
  name: "Anand Sweets", category: "sweet_shop", city: "Indiranagar",
  reviewCount: 892, hasWebsite: false, defects: [] as string[],
  signals: { runs_ads: true },
};

const stub = (out: unknown): LlmClient => ({ complete: async () => out });

describe("rerank", () => {
  it("returns a keep verdict with a reason", async () => {
    const r = await rerank(input, stub({
      verdict: "keep", reason: "Real business, proven revenue, no site", adjustment: 5,
    }));
    expect(r.verdict).toBe("keep");
    expect(r.reason).toContain("Real business");
    expect(r.adjustment).toBe(5);
  });

  it("preserves the reason on a drop so a wrong drop is visible", async () => {
    const r = await rerank(input, stub({
      verdict: "drop", reason: "Government office — not a commercial prospect", adjustment: 0,
    }));
    expect(r.verdict).toBe("drop");
    expect(r.reason).toContain("Government office");
  });

  it("clamps an out-of-range adjustment to +/-20", async () => {
    expect((await rerank(input, stub({ verdict: "keep", reason: "x", adjustment: 500 })))
      .adjustment).toBe(20);
    expect((await rerank(input, stub({ verdict: "keep", reason: "x", adjustment: -500 })))
      .adjustment).toBe(-20);
  });

  it("falls back to a neutral keep when the LLM errors", async () => {
    const failing: LlmClient = { complete: async () => { throw new Error("429"); } };
    const r = await rerank(input, failing);
    expect(r.verdict).toBe("keep");
    expect(r.adjustment).toBe(0);
    expect(r.reason).toMatch(/unavailable/i);
  });

  it("falls back to a neutral keep when the LLM returns a malformed shape", async () => {
    const r = await rerank(input, stub({ nonsense: true }));
    expect(r.verdict).toBe("keep");
    expect(r.adjustment).toBe(0);
  });
});
