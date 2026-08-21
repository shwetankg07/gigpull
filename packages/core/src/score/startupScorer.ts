/**
 * Ranking for the startup tab.
 *
 * The objective is narrow and was chosen deliberately: maximise the chance of
 * a reply from somewhere that can pay. It is not "best company" — every stage,
 * sector and team size is acceptable to this operator, so category filters
 * rank nothing and would leave 885 companies tied.
 *
 * Each axis measures one thing and moves in one direction. The sweet spot —
 * funded but still small — is deliberately NOT encoded in any single axis; it
 * emerges from receptivity falling as pay capacity rises. Building the hump
 * into an axis would hide the reasoning and make the weights untunable.
 */

export type Stage =
  | "Pre-seed" | "Seed" | "Series A" | "Series B" | "Series C" | "Series C+"
  | "Public" | "Bootstrapped" | "Acquired" | null;

export type TeamSize = "1-10" | "11-50" | "51-200" | "201-500" | "500+" | null;

export type Status = "Active" | "Acquired" | "Closed" | null;

export interface StartupScoreInput {
  stage: Stage;
  teamSize: TeamSize;
  status: Status;
  fundingUsd: number | null;
  hasJobsUrl: boolean;
  hasLinkedin: boolean;
  hasFounderLink: boolean;
  hasWebsite: boolean;
  /** To the nearest configured anchor; null when the company has no coordinates. */
  distanceKm: number | null;
}

export type StartupAxis =
  | "pay_capacity" | "receptivity" | "reachability" | "latency" | "proximity";

export interface StartupWeights {
  version: string;
  axis: Record<StartupAxis, number>;
}

export const DEFAULT_STARTUP_WEIGHTS: StartupWeights = {
  version: "startup-v1",
  axis: {
    // These two are the whole ranking, and they pull against each other:
    // small companies answer, funded companies pay. Swept against all 885
    // live records, measuring what fraction of the top 40 is the intended
    // funded-but-small profile against how many companies with no funding
    // figure at all leak in:
    //
    //   1.6 / 0.8 -> 32 of 40 on target, but 2 with no funding figure
    //   1.4 / 1.0 -> 27 of 40 on target,      1 with no funding figure
    //   1.3 / 1.1 -> 24 of 40 on target,      0 — but CRED reappears at #3
    //   1.2 / 1.2 -> 20 of 40 on target,          CRED at #1, giants return
    //
    // 1.4 / 1.0 is the knee: the operator's one stated dealbreaker is unpaid
    // work, and past this point large companies retake the list.
    receptivity: 1.4,
    pay_capacity: 1.0,
    reachability: 0.7,
    latency: 0.4,
    // Deliberately small. Being nearby is a tiebreak and a hint about how to
    // make contact, never a reason to prefer a worse company.
    proximity: 0.3,
  },
};

export interface StartupScoreResult {
  total: number;
  axes: Record<StartupAxis, number>;
  weightsVersion: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * ₹1 crore = 10,000,000 INR, converted at a rounded long-run rate. Exactly one
 * live record is rupee-denominated, so precision here is irrelevant — but
 * silently dropping it would be a hole in the parser rather than a rounding
 * choice.
 */
const INR_PER_USD = 83;

/**
 * Parses the funding strings the dataset actually ships.
 *
 * 287 of 477 carry a doubled dollar sign ('$$40M') and others carry '+', '>'
 * or rupees. Returns null — not zero — when nothing parses: "unknown" and
 * "broke" must not collapse into the same number, or every undocumented
 * company would rank as though it certainly could not pay.
 */
export function parseFundingUsd(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/\s/g, "").match(/([0-9]+(?:\.[0-9]+)?)\s*(Cr|[KMB])/i);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;

  switch (m[2]!.toLowerCase()) {
    case "cr": return (n * 10_000_000) / INR_PER_USD;
    case "k": return n * 1_000;
    case "m": return n * 1_000_000;
    case "b": return n * 1_000_000_000;
    default: return null;
  }
}

/** Smaller teams answer students. Monotonic on purpose. */
const RECEPTIVITY_BY_SIZE: Record<NonNullable<TeamSize>, number> = {
  "1-10": 100, "11-50": 90, "51-200": 65, "201-500": 40, "500+": 20,
};

const RECEPTIVITY_BY_STAGE: Record<NonNullable<Stage>, number> = {
  "Pre-seed": 100, "Seed": 95, "Bootstrapped": 85, "Series A": 80,
  "Series B": 60, "Series C": 45, "Series C+": 40, "Public": 20, "Acquired": 30,
};

/** Raised nothing, but bills customers — the one profile that pays from revenue. */
const BOOTSTRAPPED_PAY_FLOOR = 55;

/**
 * Fallback only, for the ~50% of records with no funding figure. Capped well
 * below what a known funding round can score: headcount is weak evidence of
 * budget, and letting it reach the top would rank every large company as
 * though its money were confirmed.
 */
const PAY_BY_SIZE: Record<NonNullable<TeamSize>, number> = {
  "1-10": 10, "11-50": 22, "51-200": 38, "201-500": 50, "500+": 60,
};

function payCapacity(i: StartupScoreInput): number {
  // A wound-up company cannot pay, whatever it once raised. No filter rule is
  // needed anywhere else because of this line.
  if (i.status === "Closed") return 0;

  // Known funding wins outright; headcount is only consulted when there is no
  // figure at all. Taking the max of the two let a 500-person company inherit
  // a high score without any evidence of money, which is how the first real
  // run put Razorpay and CRED above every seed-stage company on the map.
  const base =
    i.fundingUsd && i.fundingUsd > 0
      ? // log10 of dollars: $100k -> 0, $10M -> ~50, $1B -> ~100.
        clamp((Math.log10(i.fundingUsd) - 5) * 25)
      : i.stage === "Bootstrapped"
        ? BOOTSTRAPPED_PAY_FLOOR
        : i.teamSize
          ? PAY_BY_SIZE[i.teamSize]
          : 35;
  // An acquisition means the money and the decision both moved elsewhere.
  return clamp(i.status === "Acquired" ? base * 0.5 : base);
}

function receptivity(i: StartupScoreInput): number {
  const size = i.teamSize ? RECEPTIVITY_BY_SIZE[i.teamSize] : 50;
  const stage = i.stage ? RECEPTIVITY_BY_STAGE[i.stage] : 50;
  return clamp((size + stage) / 2);
}

/**
 * How many ways there are to reach a human.
 *
 * The spread is deliberately narrow. Only 19.5% of records carry a LinkedIn
 * and 8.5% a founder link, and that sparsity tracks company size — so a wide
 * spread would punish small companies for someone else's incomplete record
 * rather than for being hard to reach. A founder link still counts most,
 * because it is the one channel that reaches a person rather than an inbox.
 */
function reachability(i: StartupScoreInput): number {
  return clamp(
    (i.hasFounderLink ? 35 : 0) + (i.hasLinkedin ? 25 : 0) + (i.hasWebsite ? 40 : 0),
  );
}

/**
 * Unadvertised need, which is the whole premise of this tool.
 *
 * A company with a careers page is an efficient, crowded market: your message
 * arrives alongside four thousand applications through an ATS. A company with
 * no listing but an obvious need is the inefficient one, where a specific
 * message arrives as the only message of its kind. Rewarding a visible
 * opening — as the first draft did — both inverts that thesis and smuggles in
 * a size bias, since careers pages belong overwhelmingly to large companies.
 */
function latency(i: StartupScoreInput): number {
  if (i.status !== "Active") return 0;
  return i.hasJobsUrl ? 0 : 100;
}

/** Beyond this, everything in Bangalore is equally far in traffic terms. */
export const PROXIMITY_HORIZON_KM = 15;

function proximity(i: StartupScoreInput): number {
  if (i.distanceKm === null || !Number.isFinite(i.distanceKm)) return 0;
  return clamp((1 - i.distanceKm / PROXIMITY_HORIZON_KM) * 100);
}

export function scoreStartup(
  i: StartupScoreInput,
  weights: StartupWeights = DEFAULT_STARTUP_WEIGHTS,
): StartupScoreResult {
  const raw: Record<StartupAxis, number> = {
    pay_capacity: payCapacity(i),
    receptivity: receptivity(i),
    reachability: reachability(i),
    latency: latency(i),
    proximity: proximity(i),
  };

  const axes = Object.fromEntries(
    (Object.keys(raw) as StartupAxis[]).map((k) => [k, raw[k] * weights.axis[k]]),
  ) as Record<StartupAxis, number>;

  return {
    total: Object.values(axes).reduce((a, b) => a + b, 0),
    axes,
    weightsVersion: weights.version,
  };
}
