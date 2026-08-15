import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { leads } from "../db/index.js";

export type LeadStatus = "new" | "shortlisted" | "contacted" | "replied" | "dead";

const FOLLOW_UP_DAYS = 7;

export function ensureLead(db: Db, companyId: number): number {
  const existing = db.select().from(leads).where(eq(leads.companyId, companyId)).get();
  if (existing) return existing.id;
  return db.insert(leads).values({ companyId }).returning({ id: leads.id }).get().id;
}

export function setStatus(
  db: Db, companyId: number, status: LeadStatus, now: Date,
): void {
  ensureLead(db, companyId);
  const patch: Partial<typeof leads.$inferInsert> = { status };

  if (status === "contacted") {
    patch.contactedAt = now.toISOString();
    const due = new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000);
    patch.followUpAt = due.toISOString();
  } else if (status === "replied" || status === "dead") {
    patch.followUpAt = null;
  }

  db.update(leads).set(patch).where(eq(leads.companyId, companyId)).run();
}

export function rateLead(db: Db, companyId: number, rating: 1 | -1): void {
  ensureLead(db, companyId);
  db.update(leads).set({ rating }).where(eq(leads.companyId, companyId)).run();
}

export function dueForFollowUp(db: Db, now: Date): number[] {
  return db.select().from(leads).all()
    .filter((l) =>
      l.status === "contacted" && l.followUpAt !== null && l.followUpAt <= now.toISOString())
    .map((l) => l.companyId);
}
