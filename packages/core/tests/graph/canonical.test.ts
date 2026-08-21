import { describe, it, expect } from "vitest";
import { canonicalKey, groupByCanonical } from "../../src/graph/canonical.js";

describe("canonicalKey", () => {
  it("collapses case, spacing and punctuation variants onto one key", () => {
    // Measured on the live dataset: 'Deep Tech' 26, 'Deeptech' 63,
    // 'deeptech' 36, 'deep tech' 1 — four spellings of one cluster.
    const forms = ["Deep Tech", "Deeptech", "deeptech", "deep tech", "Deep-Tech"];
    expect(new Set(forms.map(canonicalKey)).size).toBe(1);
  });

  it("keeps '+' significant so Series B and Series B+ stay apart", () => {
    // Stripping every non-alphanumeric merges two genuinely different
    // funding stages. This is the one place the squash must not squash.
    expect(canonicalKey("Series B")).not.toBe(canonicalKey("Series B+"));
  });

  it("merges the real investor spelling variants", () => {
    expect(canonicalKey("Info Edge Ventures")).toBe(canonicalKey("InfoEdge Ventures"));
    expect(canonicalKey("Peak XV (Surge)")).toBe(canonicalKey("Peak XV Surge"));
    expect(canonicalKey("BEENEXT")).toBe(canonicalKey("Beenext"));
  });

  it("does not merge different investors that merely share a prefix", () => {
    expect(canonicalKey("Peak XV Partners")).not.toBe(canonicalKey("Peak XV Surge"));
  });
});

describe("groupByCanonical", () => {
  const entries = [
    { name: "SaaS", ownerId: 1 }, { name: "saas", ownerId: 2 },
    { name: "SaaS", ownerId: 3 }, { name: "  ", ownerId: 4 },
    { name: "Fintech", ownerId: 1 }, { name: "SaaS", ownerId: 1 },
  ];

  it("picks the most common surface form as the display name", () => {
    const saas = groupByCanonical(entries).find((g) => g.key === "saas")!;
    expect(saas.display).toBe("SaaS");
  });

  it("breaks display ties deterministically, preferring the capitalised form", () => {
    // 'logistics' and 'Logistics' both appear 13 times in the live data.
    const tied = groupByCanonical([
      { name: "logistics", ownerId: 1 }, { name: "Logistics", ownerId: 2 },
    ]);
    expect(tied[0]!.display).toBe("Logistics");
  });

  it("dedupes owners so one company counted twice is still one member", () => {
    const saas = groupByCanonical(entries).find((g) => g.key === "saas")!;
    expect(saas.ownerIds).toEqual([1, 2, 3]);
  });

  it("drops blank names instead of creating an empty group", () => {
    expect(groupByCanonical(entries).map((g) => g.key)).not.toContain("");
  });

  it("orders groups by size so the hubs come first", () => {
    expect(groupByCanonical(entries).map((g) => g.key)).toEqual(["saas", "fintech"]);
  });
});
