import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { companies, signals, contacts, probes, scores, leads } from "./db/index.js";
import type { Collector } from "./collect/types.js";
import { runCollectors } from "./collect/runner.js";
import { upsertCandidates } from "./normalise/dedupe.js";
import { selectForEnrichment } from "./enrich/prefilter.js";
import { probeWebsite } from "./enrich/webProbe.js";
import { probeGithubOrg, type GithubProbeResult } from "./enrich/githubProbe.js";
import { score, DEFAULT_WEIGHTS } from "./score/scorer.js";
import { rerank } from "./score/rerank.js";
import { buildBrief } from "./brief/brief.js";
import { ensureLead, setStatus } from "./track/leads.js";
import type { LlmClient } from "./llm/client.js";
import type { GigpullConfig } from "./config.js";

export interface PipelineOptions {
  config: GigpullConfig;
  collectors: Collector[];
  llm: LlmClient;
  now: Date;
  skipWebProbe?: boolean;
  minReviewCount?: number;
  /**
   * Injected so tests can drive startup-mode enrichment without hitting the
   * GitHub API. Defaults to the real probe.
   */
  probeGithub?: (
    org: string,
    cfg: GigpullConfig,
    now: Date,
  ) => Promise<GithubProbeResult>;
}

export interface PipelineSummary {
  collected: number;
  created: number;
  merged: number;
  enriched: number;
  scored: number;
  reranked: number;
  dropped: number;
  rerankAvailable: boolean;
}

function signalMap(db: Db, companyId: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of db.select().from(signals).where(eq(signals.companyId, companyId)).all()) {
    out[s.kind] = JSON.parse(s.valueJson);
  }
  return out;
}

/**
 * Defects from the most recent successful probe of each kind, merged.
 * A company can carry both a web probe and a GitHub probe; taking only the
 * last row would silently discard whichever ran first.
 */
function latestDefects(db: Db, companyId: number): string[] {
  const rows = db.select().from(probes).where(eq(probes.companyId, companyId)).all();

  const newestByKind = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!row.ok) continue;
    const seen = newestByKind.get(row.kind);
    if (!seen || row.ranAt >= seen.ranAt) newestByKind.set(row.kind, row);
  }

  const defects = new Set<string>();
  for (const row of newestByKind.values()) {
    const parsed = JSON.parse(row.resultJson) as { defects?: string[] };
    for (const d of parsed.defects ?? []) defects.add(d);
  }
  return [...defects];
}

export async function runPipeline(
  db: Db,
  opts: PipelineOptions,
): Promise<PipelineSummary> {
  const iso = opts.now.toISOString();

  // 1. Collect
  const outcomes = await runCollectors(db, opts.collectors, {
    now: opts.now, config: opts.config,
  });
  const candidates = outcomes.flatMap((o) => o.candidates);

  // 2. Normalise
  const { created, merged } = upsertCandidates(db, candidates, opts.now);

  // 3. Enrich
  const targets = selectForEnrichment(db, {
    minReviewCount: opts.minReviewCount ?? 50,
  });
  const githubProbe = opts.probeGithub ?? probeGithubOrg;
  let enriched = 0;

  for (const t of targets) {
    if (!opts.skipWebProbe && t.website) {
      const result = await probeWebsite(t.website);
      db.insert(probes).values({
        companyId: t.id, kind: "web", ok: result.ok,
        resultJson: JSON.stringify(result), ranAt: iso,
        expiresAt: new Date(opts.now.getTime() + 7 * 86_400_000).toISOString(),
      }).run();
      enriched += 1;
    }

    // Startup mode only, and only when a collector recorded an org handle.
    // Probing a guessed org name wastes rate limit and produces noise.
    const org = signalMap(db, t.id).github_org;
    if (t.mode === "startup" && typeof org === "string" && org.length > 0) {
      const result = await githubProbe(org, opts.config, opts.now);
      db.insert(probes).values({
        companyId: t.id, kind: "github", ok: result.ok,
        resultJson: JSON.stringify(result), ranAt: iso,
        expiresAt: new Date(opts.now.getTime() + 86_400_000).toISOString(),
      }).run();
      enriched += 1;
    }
  }

  // 4a. Deterministic score over every surviving company
  const ranked: Array<{ companyId: number; total: number }> = [];
  for (const t of targets) {
    const sig = signalMap(db, t.id);
    const defects = latestDefects(db, t.id);
    const contactRows = db.select().from(contacts).where(eq(contacts.companyId, t.id)).all();

    const result = score({
      mode: t.mode,
      reviewCount: Number(sig.review_count ?? 0),
      runsAds: sig.runs_ads === true,
      premiumListing: sig.premium_listing === true,
      multipleLocations: sig.multiple_locations === true,
      fundedWithin180d: sig.funded_within_180d === true,
      hasOpenRole: sig.has_open_role === true,
      hasWebsite: sig.has_website === true,
      defects,
      hasDirectContact: contactRows.length > 0,
    }, DEFAULT_WEIGHTS);

    db.insert(scores).values({
      companyId: t.id, total: result.total,
      breakdownJson: JSON.stringify(result.breakdown),
      weightsVersion: result.weightsVersion, scoredAt: iso,
    }).run();

    ranked.push({ companyId: t.id, total: result.total });
  }

  // 4b. LLM rerank over the top N only
  ranked.sort((a, b) => b.total - a.total);
  const topN = ranked.slice(0, opts.config.rerankTopN);
  let reranked = 0;
  let dropped = 0;
  let rerankAvailable = true;

  for (const entry of topN) {
    const company = db.select().from(companies)
      .where(eq(companies.id, entry.companyId)).get()!;
    const sig = signalMap(db, entry.companyId);
    const defects = latestDefects(db, entry.companyId);

    const verdict = await rerank({
      name: company.name, category: company.category, city: company.city,
      reviewCount: Number(sig.review_count ?? 0),
      hasWebsite: sig.has_website === true, defects, signals: sig,
    }, opts.llm);

    if (/^rerank unavailable/i.test(verdict.reason)) rerankAvailable = false;
    else reranked += 1;

    const scoreRow = db.select().from(scores)
      .where(eq(scores.companyId, entry.companyId)).all().at(-1)!;

    db.update(scores).set({
      rerankVerdict: verdict.verdict, rerankReason: verdict.reason,
      rerankAdjustment: verdict.adjustment,
      adjustedTotal: scoreRow.total + verdict.adjustment,
      rerankedAt: iso, rerankSignalHash: JSON.stringify(sig),
    }).where(eq(scores.id, scoreRow.id)).run();

    ensureLead(db, entry.companyId);

    if (verdict.verdict === "drop") {
      setStatus(db, entry.companyId, "dead", opts.now);
      dropped += 1;
      continue;
    }

    const contactRows = db.select().from(contacts)
      .where(eq(contacts.companyId, entry.companyId)).all();

    const briefMd = buildBrief({
      name: company.name, city: company.city,
      rating: sig.rating === null || sig.rating === undefined ? null : Number(sig.rating),
      reviewCount: Number(sig.review_count ?? 0),
      hasWebsite: sig.has_website === true,
      runsAds: sig.runs_ads === true,
      defects,
      contacts: contactRows.map((c) => ({ type: c.type, value: c.value })),
      angle: null,
    });

    db.update(leads).set({ briefMd }).where(eq(leads.companyId, entry.companyId)).run();
  }

  return {
    collected: candidates.length, created, merged, enriched,
    scored: ranked.length, reranked, dropped, rerankAvailable,
  };
}
