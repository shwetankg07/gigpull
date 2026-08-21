import { describe, it, expect } from "vitest";
import { syncStartups, toScoreInput, type StartupStore, type PlacedNode } from "../../src/startup/sync.js";
import type { RawCandidate } from "../../src/core/types.js";
import type { Collector } from "../../src/collect/types.js";
import type { GraphEdge } from "../../src/graph/edges.js";
import { loadConfig } from "../../src/config.js";

function candidate(over: Partial<RawCandidate> = {}): RawCandidate {
  return {
    mode: "startup", identityKey: `bsm:${over.name ?? "x"}`, name: "X",
    website: "https://x.example", city: "HSR Layout", category: "startup",
    source: "bsm", sourceUrl: "https://bangalorestartupmap.com/company/x",
    lat: null, lon: null,
    signals: [
      { kind: "has_website", value: true }, { kind: "has_open_role", value: false },
      { kind: "stage", value: "Seed" }, { kind: "team_size", value: "11-50" },
      { kind: "status", value: "Active" }, { kind: "sector", value: "Fintech" },
      { kind: "investors", value: ["Alpha Capital"] }, { kind: "tags", value: ["upi"] },
    ],
    contacts: [],
    ...over,
  };
}

function fakeStore() {
  const ids = new Map<string, number>();
  const state = {
    signals: new Map<number, unknown>(), contacts: new Map<number, unknown>(),
    scores: [] as Array<{ companyId: number; total: number }>,
    nodes: [] as PlacedNode[], edges: [] as GraphEdge[], graphWrites: 0,
  };
  const store: StartupStore = {
    async upsertCompany(c) {
      // Same identity key must return the same id, or a re-run duplicates
      // every company instead of updating it.
      if (!ids.has(c.identityKey)) ids.set(c.identityKey, ids.size + 1);
      return ids.get(c.identityKey)!;
    },
    async replaceSignals(id, s) { state.signals.set(id, s); },
    async replaceContacts(id, c) { state.contacts.set(id, c); },
    async insertScore(companyId, r) { state.scores.push({ companyId, total: r.total }); },
    async replaceGraph(nodes, edges) {
      state.graphWrites++; state.nodes = nodes; state.edges = edges;
    },
  };
  return { store, state };
}

const collectorOf = (cands: RawCandidate[]): Collector => ({
  name: "fake", mode: "startup",
  async *run() { for (const c of cands) yield c; },
});

const ctx = { now: new Date("2026-08-22T00:00:00Z"), config: loadConfig({}) };

describe("syncStartups", () => {
  it("stores, scores and graphs every collected company", async () => {
    const { store, state } = fakeStore();
    const summary = await syncStartups(
      collectorOf([
        candidate({ name: "A", identityKey: "bsm:a" }),
        candidate({ name: "B", identityKey: "bsm:b" }),
      ]),
      store, ctx,
    );
    expect(summary).toMatchObject({ collected: 2, scored: 2 });
    expect(state.scores).toHaveLength(2);
    expect(state.nodes.filter((n) => n.kind === "company")).toHaveLength(2);
  });

  it("gives every node a position", async () => {
    const { store, state } = fakeStore();
    await syncStartups(
      collectorOf([1, 2, 3].map((i) => candidate({ name: `C${i}`, identityKey: `bsm:c${i}` }))),
      store, ctx,
    );
    for (const n of state.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("writes the graph once, not once per company", async () => {
    // Rebuilding the layout per row would be ~3 seconds each on live data.
    const { store, state } = fakeStore();
    await syncStartups(
      collectorOf([1, 2, 3].map((i) => candidate({ name: `C${i}`, identityKey: `bsm:c${i}` }))),
      store, ctx,
    );
    expect(state.graphWrites).toBe(1);
  });

  it("links an investor hub to its own company record when it has one", async () => {
    // 46 investors in the live data are also VC records. Linking them makes
    // the hub clickable through to a page with partner contacts.
    const { store, state } = fakeStore();
    await syncStartups(
      collectorOf([
        candidate({ name: "Alpha Capital", identityKey: "bsm:alpha", category: "vc" }),
        candidate({ name: "P", identityKey: "bsm:p" }),
        candidate({ name: "Q", identityKey: "bsm:q" }),
      ]),
      store, ctx,
    );
    const hub = state.nodes.find((n) => n.kind === "investor" && n.label === "Alpha Capital");
    expect(hub?.companyId).toBe(1);
  });

  it("re-running keeps company ids stable", async () => {
    const { store, state } = fakeStore();
    const cands = [candidate({ name: "A", identityKey: "bsm:a" })];
    await syncStartups(collectorOf(cands), store, ctx);
    await syncStartups(collectorOf(cands), store, ctx);
    expect(state.scores.map((s) => s.companyId)).toEqual([1, 1]);
  });
});

describe("toScoreInput", () => {
  it("passes only opportunity properties to the scorer", () => {
    const input = toScoreInput(candidate(), []);
    expect(input).toMatchObject({ stage: "Seed", teamSize: "11-50", status: "Active" });
    // Sector and tags describe the kind of work; the scorer must not see them,
    // or the ranking stops being neutral about what the company does.
    expect(Object.keys(input)).not.toContain("sector");
    expect(Object.keys(input)).not.toContain("tags");
  });

  it("measures distance only when both coordinates and anchors exist", () => {
    const anchors = [{ lat: 12.97, lon: 77.64 }];
    expect(toScoreInput(candidate(), anchors).distanceKm).toBeNull();
    expect(toScoreInput(candidate({ lat: 12.98, lon: 77.65 }), anchors).distanceKm)
      .toBeLessThan(3);
    expect(toScoreInput(candidate({ lat: 12.98, lon: 77.65 }), []).distanceKm).toBeNull();
  });
});
