export type Axis =
  | "pay_capacity" | "urgency" | "gap" | "reachability" | "latency_bonus";

export interface Weights {
  version: string;
  axis: Record<Axis, number>;
}

export const DEFAULT_WEIGHTS: Weights = {
  version: "v1",
  axis: {
    pay_capacity: 1.0,
    urgency: 0.6,
    gap: 1.2,
    reachability: 0.8,
    latency_bonus: 0.5,
  },
};
