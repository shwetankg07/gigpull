import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { leads } from "../db/index.js";
import { ensureLead } from "./leads.js";

export function setNotes(db: Db, companyId: number, notes: string): void {
  ensureLead(db, companyId);
  db.update(leads)
    .set({ notes: notes.trim() || null })
    .where(eq(leads.companyId, companyId))
    .run();
}
