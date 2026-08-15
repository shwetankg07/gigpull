import { describe, it, expect } from "vitest";
import { openDb, companies, signals, leads } from "../../src/db/index.js";
import { selectForEnrichment } from "../../src/enrich/prefilter.js";

const iso = "2026-08-16T00:00:00Z";

function addCompany(db: ReturnType<typeof openDb>, key: string, sig: Array<[string, unknown]>) {
  const row = db.insert(companies).values({
    identityKey: key, mode: "local", name: key, createdAt: iso, updatedAt: iso,
  }).returning({ id: companies.id }).get();
  for (const [kind, value] of sig) {
    db.insert(signals).values({
      companyId: row.id, source: "t", kind, valueJson: JSON.stringify(value), observedAt: iso,
    }).run();
  }
  return row.id;
}

describe("selectForEnrichment", () => {
  it("passes a company with enough reviews", () => {
    const db = openDb(":memory:");
    addCompany(db, "place:1", [["review_count", 300]]);
    expect(selectForEnrichment(db, { minReviewCount: 50 })).toHaveLength(1);
  });

  it("rejects a company below the review floor with no other pay signal", () => {
    const db = openDb(":memory:");
    addCompany(db, "place:2", [["review_count", 3]]);
    expect(selectForEnrichment(db, { minReviewCount: 50 })).toHaveLength(0);
  });

  it("passes a low-review company that runs paid ads", () => {
    const db = openDb(":memory:");
    addCompany(db, "place:3", [["review_count", 3], ["runs_ads", true]]);
    expect(selectForEnrichment(db, { minReviewCount: 50 })).toHaveLength(1);
  });

  it("passes a startup funded inside the window", () => {
    const db = openDb(":memory:");
    const id = db.insert(companies).values({
      identityKey: "domain:x.com", mode: "startup", name: "X",
      createdAt: iso, updatedAt: iso,
    }).returning({ id: companies.id }).get().id;
    db.insert(signals).values({
      companyId: id, source: "t", kind: "funded_within_180d",
      valueJson: "true", observedAt: iso,
    }).run();
    expect(selectForEnrichment(db, { minReviewCount: 50 })).toHaveLength(1);
  });

  it("skips a company already marked dead", () => {
    const db = openDb(":memory:");
    const id = addCompany(db, "place:4", [["review_count", 900]]);
    db.insert(leads).values({ companyId: id, status: "dead" }).run();
    expect(selectForEnrichment(db, { minReviewCount: 50 })).toHaveLength(0);
  });
});
