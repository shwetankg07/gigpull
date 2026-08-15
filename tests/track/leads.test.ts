import { describe, it, expect } from "vitest";
import { openDb, companies, leads } from "../../src/db/index.js";
import { ensureLead, setStatus, rateLead, dueForFollowUp } from "../../src/track/leads.js";
import { eq } from "drizzle-orm";

const iso = "2026-08-16T00:00:00Z";

function seed(db: ReturnType<typeof openDb>) {
  return db.insert(companies).values({
    identityKey: "place:1", mode: "local", name: "A", createdAt: iso, updatedAt: iso,
  }).returning({ id: companies.id }).get().id;
}

describe("lead tracking", () => {
  it("creates a lead at status new", () => {
    const db = openDb(":memory:");
    const id = seed(db);
    ensureLead(db, id);
    expect(db.select().from(leads).where(eq(leads.companyId, id)).get()!.status).toBe("new");
  });

  it("is idempotent — calling twice does not create two leads", () => {
    const db = openDb(":memory:");
    const id = seed(db);
    ensureLead(db, id);
    ensureLead(db, id);
    expect(db.select().from(leads).all()).toHaveLength(1);
  });

  it("records contactedAt and a day-7 follow-up when marked contacted", () => {
    const db = openDb(":memory:");
    const id = seed(db);
    ensureLead(db, id);
    setStatus(db, id, "contacted", new Date(iso));
    const lead = db.select().from(leads).where(eq(leads.companyId, id)).get()!;
    expect(lead.status).toBe("contacted");
    expect(lead.contactedAt).toBe("2026-08-16T00:00:00.000Z");
    expect(lead.followUpAt).toBe("2026-08-23T00:00:00.000Z");
  });

  it("clears the follow-up when a lead replies", () => {
    const db = openDb(":memory:");
    const id = seed(db);
    ensureLead(db, id);
    setStatus(db, id, "contacted", new Date(iso));
    setStatus(db, id, "replied", new Date(iso));
    expect(db.select().from(leads).where(eq(leads.companyId, id)).get()!.followUpAt).toBeNull();
  });

  it("stores a thumbs rating for later weight tuning", () => {
    const db = openDb(":memory:");
    const id = seed(db);
    ensureLead(db, id);
    rateLead(db, id, 1);
    expect(db.select().from(leads).where(eq(leads.companyId, id)).get()!.rating).toBe(1);
  });

  it("lists leads whose follow-up date has arrived", () => {
    const db = openDb(":memory:");
    const id = seed(db);
    ensureLead(db, id);
    setStatus(db, id, "contacted", new Date(iso));
    expect(dueForFollowUp(db, new Date("2026-08-22T00:00:00Z"))).toEqual([]);
    expect(dueForFollowUp(db, new Date("2026-08-24T00:00:00Z"))).toEqual([id]);
  });
});
