import { describe, it, expect } from "vitest";
import { score, DEFAULT_WEIGHTS } from "../../src/score/scorer.js";
import type { ScoreInput } from "../../src/score/scorer.js";

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    mode: "local", reviewCount: 0, runsAds: false, premiumListing: false,
    multipleLocations: false, fundedWithin180d: false, hasOpenRole: false,
    hasWebsite: true, defects: [], hasDirectContact: false, ...over,
  };
}

describe("score", () => {
  it("is deterministic — same input, same total", () => {
    const a = score(input({ reviewCount: 500 }), DEFAULT_WEIGHTS);
    const b = score(input({ reviewCount: 500 }), DEFAULT_WEIGHTS);
    expect(a.total).toBe(b.total);
  });

  it("ranks a high-review advertiser with no website above a quiet one", () => {
    const strong = score(input({
      reviewCount: 890, runsAds: true, hasWebsite: false, hasDirectContact: true,
    }), DEFAULT_WEIGHTS);
    const weak = score(input({ reviewCount: 12 }), DEFAULT_WEIGHTS);
    expect(strong.total).toBeGreaterThan(weak.total);
  });

  it("scores no-website as the maximum local gap", () => {
    const noSite = score(input({ hasWebsite: false }), DEFAULT_WEIGHTS);
    const withSite = score(input({ hasWebsite: true }), DEFAULT_WEIGHTS);
    expect(noSite.breakdown.gap).toBeGreaterThan(withSite.breakdown.gap);
  });

  it("counts probe defects toward the gap axis", () => {
    const withDefects = score(
      input({ defects: ["console_errors", "no_mobile_viewport"] }), DEFAULT_WEIGHTS);
    const clean = score(input({ defects: [] }), DEFAULT_WEIGHTS);
    expect(withDefects.breakdown.gap).toBeGreaterThan(clean.breakdown.gap);
  });

  it("gives latency_bonus only in startup mode with no advertised role", () => {
    const quiet = score(input({ mode: "startup", hasOpenRole: false }), DEFAULT_WEIGHTS);
    const hiring = score(input({ mode: "startup", hasOpenRole: true }), DEFAULT_WEIGHTS);
    const local = score(input({ mode: "local" }), DEFAULT_WEIGHTS);
    expect(quiet.breakdown.latency_bonus).toBeGreaterThan(hiring.breakdown.latency_bonus);
    expect(local.breakdown.latency_bonus).toBe(0);
  });

  it("returns a breakdown for every axis and a matching weights version", () => {
    const r = score(input(), DEFAULT_WEIGHTS);
    expect(Object.keys(r.breakdown).sort()).toEqual(
      ["gap", "latency_bonus", "pay_capacity", "reachability", "urgency"]);
    expect(r.weightsVersion).toBe(DEFAULT_WEIGHTS.version);
  });

  it("is blind to technology stack — no stack field exists on the input", () => {
    expect(Object.keys(input())).not.toContain("stack");
  });
});
