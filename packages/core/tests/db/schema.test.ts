import { describe, it, expect } from "vitest";
import { openDb, companies, leads } from "../../src/db/index.js";
import { eq } from "drizzle-orm";

describe("schema", () => {
  it("inserts and reads a company", () => {
    const db = openDb(":memory:");
    const now = new Date().toISOString();
    db.insert(companies).values({
      identityKey: "place:abc", mode: "local", name: "Anand Sweets",
      createdAt: now, updatedAt: now,
    }).run();
    const rows = db.select().from(companies).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Anand Sweets");
  });

  it("rejects a duplicate identity_key", () => {
    const db = openDb(":memory:");
    const now = new Date().toISOString();
    const row = {
      identityKey: "place:abc", mode: "local" as const, name: "X",
      createdAt: now, updatedAt: now,
    };
    db.insert(companies).values(row).run();
    expect(() => db.insert(companies).values(row).run()).toThrow();
  });

  it("defaults a new lead to status 'new'", () => {
    const db = openDb(":memory:");
    const now = new Date().toISOString();
    db.insert(companies).values({
      identityKey: "place:xyz", mode: "local", name: "Y",
      createdAt: now, updatedAt: now,
    }).run();
    db.insert(leads).values({ companyId: 1 }).run();
    const lead = db.select().from(leads).where(eq(leads.companyId, 1)).get();
    expect(lead!.status).toBe("new");
  });
});
