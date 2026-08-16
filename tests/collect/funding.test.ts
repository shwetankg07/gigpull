import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFundingFeed, createFundingCollector } from "../../src/collect/funding.js";
import { loadConfig } from "../../src/config.js";
import type { LlmClient } from "../../src/llm/client.js";

const xml = readFileSync("tests/fixtures/funding-feed.xml", "utf8");
const ctx = { now: new Date("2026-08-16T00:00:00Z"), config: loadConfig({} as NodeJS.ProcessEnv) };

describe("parseFundingFeed", () => {
  it("extracts every item with title, link and date", () => {
    const items = parseFundingFeed(xml);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toContain("Kolo raises");
    expect(items[0]!.link).toBe("https://entrackr.example/kolo-seed");
    expect(items[0]!.publishedAt).toContain("2026");
  });

  it("throws on malformed xml rather than returning junk", () => {
    expect(() => parseFundingFeed("<not-rss/>")).toThrow();
  });
});

describe("createFundingCollector", () => {
  it("turns an extracted article into a startup candidate", async () => {
    const llm: LlmClient = {
      async complete() {
        return { company: "Kolo", website: "https://kolo.example", stage: "seed", amountUsd: 500000 };
      },
    };
    const collector = createFundingCollector([], llm);
    const out = [];
    for await (const c of collector.runFromItems!([
      { title: "Kolo raises $500K seed", link: "https://e.example/kolo", publishedAt: "2026-08-11T06:00:00Z" },
    ], ctx)) {
      out.push(c);
    }
    expect(out).toHaveLength(1);
    expect(out[0]!.mode).toBe("startup");
    expect(out[0]!.identityKey).toBe("domain:kolo.example");
    expect(out[0]!.signals.find((s) => s.kind === "funded_within_180d")!.value).toBe(true);
  });

  it("skips an article the LLM cannot resolve to a website", async () => {
    const llm: LlmClient = {
      async complete() { return { company: "Mystery", website: null, stage: null, amountUsd: null }; },
    };
    const collector = createFundingCollector([], llm);
    const out = [];
    for await (const c of collector.runFromItems!([
      { title: "Mystery raises money", link: "https://e.example/m", publishedAt: "2026-08-11T06:00:00Z" },
    ], ctx)) {
      out.push(c);
    }
    expect(out).toHaveLength(0);
  });
});
