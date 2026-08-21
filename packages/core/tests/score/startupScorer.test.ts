import { describe, it, expect } from "vitest";
import {
  scoreStartup, parseFundingUsd, DEFAULT_STARTUP_WEIGHTS,
  type StartupScoreInput,
} from "../../src/score/startupScorer.js";

const input = (over: Partial<StartupScoreInput> = {}): StartupScoreInput => ({
  stage: "Seed", teamSize: "11-50", status: "Active", fundingUsd: 5_000_000,
  hasJobsUrl: false, hasLinkedin: false, hasFounderLink: false, hasWebsite: true,
  distanceKm: null, ...over,
});

describe("parseFundingUsd", () => {
  it("survives the doubled dollar sign in 287 of 477 live records", () => {
    expect(parseFundingUsd("$$40M")).toBe(40_000_000);
  });

  it("reads every magnitude and the noisy suffixes", () => {
    expect(parseFundingUsd("$$58.1M")).toBeCloseTo(58_100_000);
    expect(parseFundingUsd("$$13K")).toBe(13_000);
    expect(parseFundingUsd("$$1.2B")).toBeCloseTo(1_200_000_000);
    expect(parseFundingUsd("$$40M+")).toBe(40_000_000);
    expect(parseFundingUsd(">$5M")).toBe(5_000_000);
  });

  it("converts the one rupee-denominated record", () => {
    expect(parseFundingUsd("₹65Cr")).toBeGreaterThan(7_000_000);
    expect(parseFundingUsd("₹65Cr")).toBeLessThan(9_000_000);
  });

  it("returns null rather than zero for unparseable input", () => {
    // null means "unknown"; zero means "broke". Conflating them would rank an
    // undocumented company as though it certainly could not pay.
    expect(parseFundingUsd("")).toBeNull();
    expect(parseFundingUsd("undisclosed")).toBeNull();
  });
});

describe("scoreStartup axes", () => {
  const ax = (over: Partial<StartupScoreInput>) => scoreStartup(input(over)).axes;

  it("receptivity falls as the company grows — small places answer students", () => {
    const sizes = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;
    const vals = sizes.map((teamSize) => ax({ teamSize }).receptivity);
    expect(vals).toEqual([...vals].sort((a, b) => b - a));
    expect(vals[0]).toBeGreaterThan(vals[4]!);
  });

  it("gives a closed company no pay capacity at all", () => {
    // The 9 dead companies need no filter rule — they cannot pay, so they
    // sink on their own. A special case here would be a second thing to keep
    // right for no gain.
    expect(ax({ status: "Closed", fundingUsd: 40_000_000 }).pay_capacity).toBe(0);
  });

  it("credits a bootstrapped company that never raised", () => {
    // No funding row, but customers instead of a board — the one profile
    // that pays out of revenue rather than out of a round.
    expect(ax({ stage: "Bootstrapped", fundingUsd: null }).pay_capacity)
      .toBeGreaterThan(ax({ stage: "Pre-seed", fundingUsd: null }).pay_capacity);
  });

  it("rewards unadvertised need, not a visible opening", () => {
    // gigpull's premise: a listed role is a crowded market. Rewarding the
    // listing inverts the thesis and, because careers pages belong mostly to
    // large companies, quietly reintroduces a size bias.
    expect(ax({ hasJobsUrl: false }).latency)
      .toBeGreaterThan(ax({ hasJobsUrl: true }).latency);
  });

  it("does not let a known funding figure be outranked by mere headcount", () => {
    // A 500-person company with no disclosed funding must not score as though
    // its money were confirmed. Taking max(size, funding) did exactly that.
    const bigUnknown = ax({ teamSize: "500+", fundingUsd: null, stage: "Public" }).pay_capacity;
    const smallFunded = ax({ teamSize: "11-50", fundingUsd: 50_000_000 }).pay_capacity;
    expect(smallFunded).toBeGreaterThan(bigUnknown);
  });

  it("scores reachability from the channels that actually exist", () => {
    expect(ax({ hasLinkedin: true, hasFounderLink: true }).reachability)
      .toBeGreaterThan(ax({ hasLinkedin: true }).reachability);
    expect(ax({ hasWebsite: false, hasLinkedin: false, hasFounderLink: false }).reachability)
      .toBe(0);
  });
});

describe("scoreStartup — emergent behaviour", () => {
  it("peaks at funded-but-small without any axis encoding that peak", () => {
    // The whole design rests on this. receptivity falls with size and
    // pay_capacity rises with money; neither is hump-shaped on its own, so
    // the sweet spot has to fall out of the sum. If it stops doing so, the
    // ranking silently becomes 'biggest company wins'.
    const at = (stage: StartupScoreInput["stage"], teamSize: StartupScoreInput["teamSize"],
                fundingUsd: number | null) => scoreStartup(input({ stage, teamSize, fundingUsd })).total;

    const tinyUnfunded = at("Pre-seed", "1-10", null);
    const sweetSpot = at("Seed", "11-50", 5_000_000);
    const growing = at("Series A", "51-200", 20_000_000);
    const giant = at("Public", "500+", 1_000_000_000);

    expect(sweetSpot).toBeGreaterThan(tinyUnfunded);
    expect(sweetSpot).toBeGreaterThan(growing);
    expect(sweetSpot).toBeGreaterThan(giant);
  });

  it("keeps the peak when sparse data covaries with size", () => {
    // The failure the first real run exposed: seed companies are missing
    // LinkedIn, founder links and funding figures far more often than large
    // ones, so holding those constant (as the test above does) hid a bias
    // that dominated the live ranking.
    const sparseSeed = scoreStartup(input({
      stage: "Seed", teamSize: "11-50", fundingUsd: null,
      hasLinkedin: false, hasFounderLink: false, hasJobsUrl: false,
    })).total;
    const richGiant = scoreStartup(input({
      stage: "Public", teamSize: "500+", fundingUsd: 1_000_000_000,
      hasLinkedin: true, hasFounderLink: true, hasJobsUrl: true,
    })).total;
    expect(sparseSeed).toBeGreaterThan(richGiant);
  });

  it("treats proximity as a bonus that can never sink a lead", () => {
    // Distance decides how you make contact, not whether the company matters.
    const near = scoreStartup(input({ distanceKm: 0 }));
    const far = scoreStartup(input({ distanceKm: 40 }));
    const unknown = scoreStartup(input({ distanceKm: null }));
    expect(near.total).toBeGreaterThan(far.total);
    expect(far.axes.proximity).toBe(0);
    expect(far.total).toBeGreaterThan(0);
    expect(unknown.axes.proximity).toBe(0);
  });

  it("cannot let proximity outrank a materially better company", () => {
    const nearDead = scoreStartup(input({ status: "Closed", fundingUsd: null, distanceKm: 0 }));
    const farGood = scoreStartup(input({ distanceKm: 40, hasLinkedin: true }));
    expect(farGood.total).toBeGreaterThan(nearDead.total);
  });

  it("is blind to technology, exactly like the local scorer", () => {
    // The neutrality rule: rank on properties of the opportunity, never on
    // whether the work resembles something already built.
    const keys = Object.keys(input()).join(" ").toLowerCase();
    for (const banned of ["stack", "tech", "language", "framework", "skill"]) {
      expect(keys).not.toContain(banned);
    }
  });

  it("reports its weights version so stored scores stay interpretable", () => {
    expect(scoreStartup(input()).weightsVersion).toBe(DEFAULT_STARTUP_WEIGHTS.version);
  });
});
