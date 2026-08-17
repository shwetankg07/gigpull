import { describe, it, expect } from "vitest";
import { openDb, companies, signals, contacts, scores, leads } from "../../src/db/index.js";
import { buildLeadViews } from "../../src/web/view.js";

const iso = "2026-08-16T00:00:00Z";

function seed(db: ReturnType<typeof openDb>) {
  const id = db.insert(companies).values({
    identityKey: "osm:node/1", mode: "local", name: "Example Tiffin Room",
    city: "Indiranagar", category: "restaurant", website: null,
    createdAt: iso, updatedAt: iso,
  }).returning({ id: companies.id }).get().id;

  db.insert(signals).values({
    companyId: id, source: "osm", kind: "has_website",
    valueJson: "false", observedAt: iso,
  }).run();
  db.insert(contacts).values({
    companyId: id, type: "phone", value: "080 00000000", source: "osm",
  }).run();
  db.insert(scores).values({
    companyId: id, total: 120, adjustedTotal: 125,
    breakdownJson: JSON.stringify({ gap: 72, reachability: 48, pay_capacity: 0 }),
    weightsVersion: "v1", scoredAt: iso,
    rerankVerdict: "keep", rerankReason: "Independent business",
    rerankFit: "Good first paid client", rerankAdjustment: 5,
  }).run();
  db.insert(leads).values({
    companyId: id, status: "new", briefMd: "**Example Tiffin Room** — no website",
  }).run();
  return id;
}

describe("buildLeadViews", () => {
  it("joins company, score, brief and contacts into one view", () => {
    const db = openDb(":memory:");
    const id = seed(db);
    const [view] = buildLeadViews(db);
    expect(view!.companyId).toBe(id);
    expect(view!.name).toBe("Example Tiffin Room");
    expect(view!.city).toBe("Indiranagar");
    expect(view!.status).toBe("new");
    expect(view!.brief).toContain("Example Tiffin Room");
    expect(view!.contacts).toEqual([{ type: "phone", value: "080 00000000" }]);
  });

  it("exposes the score breakdown so the ranking can be argued with", () => {
    const db = openDb(":memory:");
    seed(db);
    const [view] = buildLeadViews(db);
    expect(view!.total).toBe(125);
    expect(view!.breakdown).toEqual({ gap: 72, reachability: 48, pay_capacity: 0 });
  });

  it("carries the rerank reason and fit through", () => {
    const db = openDb(":memory:");
    seed(db);
    const [view] = buildLeadViews(db);
    expect(view!.rerankReason).toBe("Independent business");
    expect(view!.fit).toBe("Good first paid client");
  });

  it("sorts by adjusted score, highest first", () => {
    const db = openDb(":memory:");
    seed(db);
    const id2 = db.insert(companies).values({
      identityKey: "osm:node/2", mode: "local", name: "Higher Scorer",
      createdAt: iso, updatedAt: iso,
    }).returning({ id: companies.id }).get().id;
    db.insert(scores).values({
      companyId: id2, total: 300, adjustedTotal: 300,
      breakdownJson: "{}", weightsVersion: "v1", scoredAt: iso,
    }).run();
    db.insert(leads).values({ companyId: id2, status: "new" }).run();

    expect(buildLeadViews(db).map((v) => v.name))
      .toEqual(["Higher Scorer", "Example Tiffin Room"]);
  });

  it("falls back to the deterministic total when no rerank has run", () => {
    const db = openDb(":memory:");
    const id = db.insert(companies).values({
      identityKey: "osm:node/3", mode: "local", name: "Unreranked",
      createdAt: iso, updatedAt: iso,
    }).returning({ id: companies.id }).get().id;
    db.insert(scores).values({
      companyId: id, total: 90, breakdownJson: "{}",
      weightsVersion: "v1", scoredAt: iso,
    }).run();
    db.insert(leads).values({ companyId: id }).run();

    expect(buildLeadViews(db)[0]!.total).toBe(90);
  });

  it("returns an empty list for an empty database", () => {
    expect(buildLeadViews(openDb(":memory:"))).toEqual([]);
  });
});
