import type { Mode } from "../core/types.js";
import { DEFAULT_WEIGHTS, type Axis, type Weights } from "./weights.js";

export { DEFAULT_WEIGHTS };
export type { Axis, Weights };

export interface ScoreInput {
  mode: Mode;
  reviewCount: number;
  runsAds: boolean;
  premiumListing: boolean;
  multipleLocations: boolean;
  fundedWithin180d: boolean;
  hasOpenRole: boolean;
  hasWebsite: boolean;
  defects: string[];
  hasDirectContact: boolean;
}

export interface ScoreResult {
  total: number;
  breakdown: Record<Axis, number>;
  weightsVersion: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function score(input: ScoreInput, weights: Weights = DEFAULT_WEIGHTS): ScoreResult {
  const reviewPoints = clamp(Math.log10(Math.max(1, input.reviewCount)) * 25);
  const payCapacity = clamp(
    reviewPoints +
      (input.runsAds ? 25 : 0) +
      (input.premiumListing ? 15 : 0) +
      (input.multipleLocations ? 10 : 0) +
      (input.fundedWithin180d ? 40 : 0) +
      (input.hasOpenRole ? 15 : 0),
  );

  const urgency = clamp(
    (input.fundedWithin180d ? 40 : 0) + (input.runsAds ? 20 : 0),
  );

  const gap = clamp(
    (input.hasWebsite ? 0 : 60) + Math.min(40, input.defects.length * 15),
  );

  const reachability = clamp(input.hasDirectContact ? 60 : 10);

  const latencyBonus =
    input.mode === "startup" && !input.hasOpenRole ? 40 : 0;

  const breakdown: Record<Axis, number> = {
    pay_capacity: payCapacity * weights.axis.pay_capacity,
    urgency: urgency * weights.axis.urgency,
    gap: gap * weights.axis.gap,
    reachability: reachability * weights.axis.reachability,
    latency_bonus: latencyBonus * weights.axis.latency_bonus,
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { total, breakdown, weightsVersion: weights.version };
}
