import { describe, it, expect } from "vitest";
import { computeLayout } from "../../src/graph/layout.js";
import { buildGraph, type GraphCompany } from "../../src/graph/edges.js";

const co = (id: number, over: Partial<GraphCompany> = {}): GraphCompany => ({
  id, name: `Co${id}`, sector: null, investors: [], tags: [], ...over,
});

/** Two tight clusters joined by nothing, plus a pair of isolated nodes. */
function twoClusters() {
  return buildGraph([
    ...[1, 2, 3].map((i) => co(i, { investors: ["Alpha Capital"] })),
    ...[4, 5, 6].map((i) => co(i, { investors: ["Beta Capital"] })),
    co(7), co(8),
  ]);
}

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);

describe("computeLayout", () => {
  it("is deterministic — the same graph lays out identically every time", () => {
    // Positions are stored, so a layout that drifted between runs would make
    // every re-collection look like the whole map had moved.
    const { nodes, edges } = twoClusters();
    expect(computeLayout(nodes, edges)).toEqual(computeLayout(nodes, edges));
  });

  it("pulls companies sharing an investor closer than unrelated ones", () => {
    const { nodes, edges } = twoClusters();
    const p = computeLayout(nodes, edges);
    const sameCluster = dist(p.get("c:1")!, p.get("c:2")!);
    const acrossClusters = dist(p.get("c:1")!, p.get("c:4")!);
    expect(sameCluster).toBeLessThan(acrossClusters);
  });

  it("never emits NaN, even when a node has no edges at all", () => {
    // 296 of 957 companies connect to nothing. A divide-by-zero on an
    // isolated node would poison the whole canvas.
    const { nodes, edges } = twoClusters();
    for (const pos of computeLayout(nodes, edges).values()) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it("separates nodes rather than stacking them at the origin", () => {
    const { nodes, edges } = twoClusters();
    const p = computeLayout(nodes, edges);
    expect(dist(p.get("c:7")!, p.get("c:8")!)).toBeGreaterThan(1);
  });

  it("places a position for every node and nothing else", () => {
    const { nodes, edges } = twoClusters();
    const p = computeLayout(nodes, edges);
    expect([...p.keys()].sort()).toEqual(nodes.map((n) => n.id).sort());
  });

  it("keeps a hub nearer its own members than to unrelated companies", () => {
    // The property that broke on real data: with weak springs the
    // 'satellites' hub settled closer to a coffee chain than to Pixxel.
    // Global clustering looked fine; local structure was noise.
    const { nodes, edges } = buildGraph([
      ...[1, 2, 3].map((i) => co(i, { tags: ["Satellites"] })),
      // 30 unrelated companies, densely linked to each other, competing for
      // the same space.
      ...Array.from({ length: 30 }, (_, k) => co(100 + k, { investors: ["Crowd Capital"] })),
    ]);
    const p = computeLayout(nodes, edges);
    const hub = p.get("t:satellites")!;
    const d = (id: string) => Math.hypot(p.get(id)!.x - hub.x, p.get(id)!.y - hub.y);
    const furthestMember = Math.max(d("c:1"), d("c:2"), d("c:3"));
    const nearestStranger = Math.min(...Array.from({ length: 30 }, (_, k) => d(`c:${100 + k}`)));
    expect(furthestMember).toBeLessThan(nearestStranger);
  });

  it("handles a single node and an empty graph without throwing", () => {
    expect(computeLayout([], [])).toEqual(new Map());
    const one = buildGraph([co(1)]);
    expect(computeLayout(one.nodes, one.edges).size).toBe(1);
  });
});
