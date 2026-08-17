import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { companies, signals, contacts } from "../db/index.js";
import type { RawCandidate } from "../core/types.js";

export interface UpsertSummary {
  created: number;
  merged: number;
}

export function upsertCandidates(
  db: Db,
  candidates: RawCandidate[],
  now: Date,
): UpsertSummary {
  const iso = now.toISOString();
  let created = 0;
  let merged = 0;

  for (const c of candidates) {
    const existing = db.select().from(companies)
      .where(eq(companies.identityKey, c.identityKey)).get();

    let companyId: number;

    if (existing) {
      companyId = existing.id;
      merged += 1;
      db.update(companies).set({
        website: existing.website ?? c.website ?? null,
        city: existing.city ?? c.city ?? null,
        category: existing.category ?? c.category ?? null,
        sourceUrl: existing.sourceUrl ?? c.sourceUrl ?? null,
        lat: existing.lat ?? c.lat ?? null,
        lon: existing.lon ?? c.lon ?? null,
        updatedAt: iso,
      }).where(eq(companies.id, companyId)).run();
    } else {
      const row = db.insert(companies).values({
        identityKey: c.identityKey, mode: c.mode, name: c.name,
        city: c.city ?? null, category: c.category ?? null,
        website: c.website ?? null, sourceUrl: c.sourceUrl ?? null,
        lat: c.lat ?? null, lon: c.lon ?? null,
        createdAt: iso, updatedAt: iso,
      }).returning({ id: companies.id }).get();
      companyId = row.id;
      created += 1;
    }

    for (const s of c.signals) {
      db.insert(signals).values({
        companyId, source: c.source, kind: s.kind,
        valueJson: JSON.stringify(s.value ?? null), observedAt: iso,
      }).run();
    }

    for (const contact of c.contacts) {
      const dupe = db.select().from(contacts).where(and(
        eq(contacts.companyId, companyId),
        eq(contacts.type, contact.type),
        eq(contacts.value, contact.value),
      )).get();
      if (!dupe) {
        db.insert(contacts).values({
          companyId, type: contact.type, value: contact.value, source: c.source,
        }).run();
      }
    }
  }

  return { created, merged };
}
