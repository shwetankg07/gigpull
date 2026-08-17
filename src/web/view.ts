import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { companies, contacts, scores, leads } from "../db/index.js";
import type { LeadStatus } from "../track/leads.js";
import { buildLinks, type Links } from "../core/links.js";

export interface LeadView {
  companyId: number;
  name: string;
  city: string | null;
  category: string | null;
  mode: string;
  website: string | null;
  status: LeadStatus;
  brief: string | null;
  rating: number | null;
  followUpAt: string | null;
  notes: string | null;
  total: number;
  breakdown: Record<string, number>;
  rerankReason: string | null;
  fit: string | null;
  contacts: Array<{ type: string; value: string }>;
  links: Links;
}

/**
 * One row per lead, joining everything the UI needs in a single pass.
 *
 * The score breakdown is carried through deliberately: the CLI throws it away,
 * but it is what lets a human see *why* something ranked where it did and argue
 * with the weights, which is the whole point of keeping the scorer deterministic.
 */
export function buildLeadViews(db: Db): LeadView[] {
  const rows = db
    .select({
      companyId: companies.id,
      name: companies.name,
      city: companies.city,
      category: companies.category,
      mode: companies.mode,
      website: companies.website,
      sourceUrl: companies.sourceUrl,
      lat: companies.lat,
      lon: companies.lon,
      status: leads.status,
      brief: leads.briefMd,
      rating: leads.rating,
      followUpAt: leads.followUpAt,
      notes: leads.notes,
      total: scores.total,
      adjustedTotal: scores.adjustedTotal,
      breakdownJson: scores.breakdownJson,
      rerankReason: scores.rerankReason,
      fit: scores.rerankFit,
      scoredAt: scores.scoredAt,
    })
    .from(leads)
    .innerJoin(companies, eq(leads.companyId, companies.id))
    .leftJoin(scores, eq(scores.companyId, companies.id))
    .all();

  const allContacts = db.select().from(contacts).all();
  const contactsByCompany = new Map<number, Array<{ type: string; value: string }>>();
  for (const c of allContacts) {
    const list = contactsByCompany.get(c.companyId) ?? [];
    list.push({ type: c.type, value: c.value });
    contactsByCompany.set(c.companyId, list);
  }

  // Every pipeline run inserts a fresh scores row, so the join above yields one
  // row per historical score. Keep only the newest per company, or the same lead
  // appears once for every time it has ever been scored.
  const newestByCompany = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    const seen = newestByCompany.get(r.companyId);
    if (!seen || (r.scoredAt ?? "") >= (seen.scoredAt ?? "")) {
      newestByCompany.set(r.companyId, r);
    }
  }

  return [...newestByCompany.values()]
    .map((r) => ({
      companyId: r.companyId,
      name: r.name,
      city: r.city,
      category: r.category,
      mode: r.mode,
      website: r.website,
      status: (r.status ?? "new") as LeadStatus,
      brief: r.brief,
      rating: r.rating,
      followUpAt: r.followUpAt,
      notes: r.notes,
      total: r.adjustedTotal ?? r.total ?? 0,
      breakdown: r.breakdownJson
        ? (JSON.parse(r.breakdownJson) as Record<string, number>)
        : {},
      rerankReason: r.rerankReason,
      fit: r.fit,
      contacts: contactsByCompany.get(r.companyId) ?? [],
      links: buildLinks({
        name: r.name, lat: r.lat, lon: r.lon,
        sourceUrl: r.sourceUrl, website: r.website,
      }),
    }))
    .sort((a, b) => b.total - a.total);
}
