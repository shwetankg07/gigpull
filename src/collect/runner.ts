import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { runs } from "../db/index.js";
import { RawCandidateSchema, type RawCandidate } from "../core/types.js";
import type { Collector, CollectorOutcome, RunContext } from "./types.js";

export async function runCollectors(
  db: Db,
  collectors: Collector[],
  ctx: RunContext,
): Promise<CollectorOutcome[]> {
  const outcomes: CollectorOutcome[] = [];

  for (const collector of collectors) {
    const started = ctx.now.toISOString();
    const inserted = db.insert(runs).values({
      collector: collector.name, mode: collector.mode, startedAt: started,
    }).returning({ id: runs.id }).get();

    const candidates: RawCandidate[] = [];
    let ok = true;
    let error: string | undefined;

    try {
      for await (const raw of collector.run(ctx)) {
        candidates.push(RawCandidateSchema.parse(raw));
      }
    } catch (e) {
      ok = false;
      error = e instanceof Error ? `${collector.name}: ${e.message}` : String(e);
    }

    db.update(runs).set({
      finishedAt: new Date().toISOString(),
      ok, itemCount: candidates.length, error: error ?? null,
    }).where(eq(runs.id, inserted.id)).run();

    outcomes.push({ collector: collector.name, ok, candidates: ok ? candidates : [], error });
  }

  return outcomes;
}
