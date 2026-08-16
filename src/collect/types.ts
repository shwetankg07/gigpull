import type { GigpullConfig } from "../config.js";
import type { Mode, RawCandidate } from "../core/types.js";

export interface RunContext {
  now: Date;
  config: GigpullConfig;
}

export interface Collector {
  name: string;
  mode: Mode;
  run(ctx: RunContext): AsyncIterable<RawCandidate>;
}

export interface CollectorOutcome {
  collector: string;
  ok: boolean;
  candidates: RawCandidate[];
  error?: string;
}
