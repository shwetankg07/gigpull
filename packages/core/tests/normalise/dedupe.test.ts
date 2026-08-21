import { describe, it, expect } from "vitest";
import { openDb, companies, signals, contacts } from "../../src/db/index.js";
import { upsertCandidates } from "../../src/normalise/dedupe.js";
import type { RawCandidate } from "../../src/core/types.js";

const now = new Date("2026-08-16T00:00:00Z");

function candidate(over: Partial<RawCandidate> = {}): RawCandidate {
  return {
    mode: "local", identityKey: "place:1", name: "Anand Sweets",
    source: "google_places", signals: [], contacts: [], ...over,
  };
}

describe("upsertCandidates", () => {
  it("creates a company for a new identity key", () => {
    const db = openDb(":memory:");
    const summary = upsertCandidates(db, [candidate()], now);
    expect(summary).toEqual({ created: 1, merged: 0 });
    expect(db.select().from(companies).all()).toHaveLength(1);
  });

  it("merges a repeat identity key instead of duplicating", () => {
    const db = openDb(":memory:");
    upsertCandidates(db, [candidate()], now);
    const summary = upsertCandidates(db, [candidate({ source: "justdial" })], now);
    expect(summary).toEqual({ created: 0, merged: 1 });
    expect(db.select().from(companies).all()).toHaveLength(1);
  });

  it("appends signals rather than overwriting them", () => {
    const db = openDb(":memory:");
    upsertCandidates(db, [candidate({ signals: [{ kind: "rating", value: 4.5 }] })], now);
    upsertCandidates(db, [candidate({
      source: "justdial", signals: [{ kind: "premium_listing", value: true }],
    })], now);
    const rows = db.select().from(signals).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.source).sort()).toEqual(["google_places", "justdial"]);
  });

  it("keeps two different companies separate", () => {
    const db = openDb(":memory:");
    upsertCandidates(db, [
      candidate({ identityKey: "place:1", name: "Acme" }),
      candidate({ identityKey: "place:2", name: "Acme" }),
    ], now);
    expect(db.select().from(companies).all()).toHaveLength(2);
  });

  it("does not duplicate an identical contact on merge", () => {
    const db = openDb(":memory:");
    const c = candidate({ contacts: [{ type: "phone", value: "98450" }] });
    upsertCandidates(db, [c], now);
    upsertCandidates(db, [c], now);
    expect(db.select().from(contacts).all()).toHaveLength(1);
  });

  it("fills in a website discovered by a later source", () => {
    const db = openDb(":memory:");
    upsertCandidates(db, [candidate({ website: null })], now);
    upsertCandidates(db, [candidate({ website: "https://anand.example" })], now);
    expect(db.select().from(companies).all()[0]!.website).toBe("https://anand.example");
  });
});
