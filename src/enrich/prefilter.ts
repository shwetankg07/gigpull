import type { Db } from "../db/index.js";
import { companies, signals, leads } from "../db/index.js";
import type { Mode } from "../core/types.js";

export interface CompanyForEnrichment {
  id: number;
  mode: Mode;
  name: string;
  website: string | null;
}

const PAY_SIGNAL_KINDS = new Set([
  "runs_ads", "premium_listing", "multiple_locations",
  "funded_within_180d", "has_open_role",
]);

export function selectForEnrichment(
  db: Db,
  opts: { minReviewCount: number },
): CompanyForEnrichment[] {
  const allCompanies = db.select().from(companies).all();
  const allSignals = db.select().from(signals).all();
  const deadIds = new Set(
    db.select().from(leads).all().filter((l) => l.status === "dead").map((l) => l.companyId),
  );

  const byCompany = new Map<number, typeof allSignals>();
  for (const s of allSignals) {
    const list = byCompany.get(s.companyId) ?? [];
    list.push(s);
    byCompany.set(s.companyId, list);
  }

  return allCompanies
    .filter((c) => {
      if (deadIds.has(c.id)) return false;
      const sigs = byCompany.get(c.id) ?? [];
      const hasFlag = sigs.some(
        (s) => PAY_SIGNAL_KINDS.has(s.kind) && JSON.parse(s.valueJson) === true,
      );
      const reviewCount = sigs
        .filter((s) => s.kind === "review_count")
        .map((s) => Number(JSON.parse(s.valueJson)) || 0);
      const enoughReviews = Math.max(0, ...reviewCount) >= opts.minReviewCount;
      return hasFlag || enoughReviews;
    })
    .map((c) => ({ id: c.id, mode: c.mode, name: c.name, website: c.website }));
}
