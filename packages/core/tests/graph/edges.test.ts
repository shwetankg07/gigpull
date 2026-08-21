import { describe, it, expect } from "vitest";
import { buildGraph, MAX_TAG_MEMBERS, type GraphCompany } from "../../src/graph/edges.js";

const co = (id: number, over: Partial<GraphCompany> = {}): GraphCompany => ({
  id, name: `Co${id}`, sector: "Fintech", investors: [], tags: [], ...over,
});

describe("buildGraph", () => {
  it("draws investors as hubs, not as pairwise cliques", () => {
    // Peak XV backs 53 companies in the live data. Pairwise that is 1,378
    // edges from one investor; as a hub it is 53. Measured across the whole
    // dataset the difference is 4,591 edges versus 751.
    const companies = Array.from({ length: 10 }, (_, i) => co(i, { investors: ["Peak XV"] }));
    const { nodes, edges } = buildGraph(companies);

    expect(nodes.filter((n) => n.kind === "investor")).toHaveLength(1);
    expect(edges).toHaveLength(10);
    expect(edges.every((e) => e.target === "i:peakxv")).toBe(true);
  });

  it("drops an investor that backs only one company", () => {
    // A hub of one connects nothing, so it is decoration, not information.
    const { nodes } = buildGraph([co(1, { investors: ["Solo Capital"] })]);
    expect(nodes.filter((n) => n.kind === "investor")).toHaveLength(0);
  });

  it("merges investor spelling variants into a single hub", () => {
    const { nodes, edges } = buildGraph([
      co(1, { investors: ["Info Edge Ventures"] }),
      co(2, { investors: ["InfoEdge Ventures"] }),
    ]);
    const hubs = nodes.filter((n) => n.kind === "investor");
    expect(hubs).toHaveLength(1);
    expect(hubs[0]!.label).toBe("Info Edge Ventures");
    expect(edges).toHaveLength(2);
  });

  it("excludes tags too generic to mean anything", () => {
    // 'saas' has 133 members upstream. A hub that large says only "software",
    // which sector colour already says, and it drags the whole layout together.
    const companies = Array.from({ length: MAX_TAG_MEMBERS + 1 }, (_, i) =>
      co(i, { tags: ["SaaS"] }));
    expect(buildGraph(companies).nodes.filter((n) => n.kind === "tag")).toHaveLength(0);
  });

  it("keeps a tag precise enough to be a real niche", () => {
    const companies = [1, 2, 3].map((i) => co(i, { tags: ["Space Tech"] }));
    const { nodes, edges } = buildGraph(companies);
    const tag = nodes.find((n) => n.kind === "tag");
    expect(tag).toMatchObject({ id: "t:spacetech", label: "Space Tech" });
    expect(edges.filter((e) => e.kind === "tag")).toHaveLength(3);
  });

  it("keeps every company as a node even when nothing connects it", () => {
    // 205 of 957 have neither a shared investor nor a shared niche. They are
    // still leads; they just float, and the list is how you reach them.
    const { nodes } = buildGraph([co(1), co(2)]);
    expect(nodes.filter((n) => n.kind === "company")).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: "c:1", label: "Co1", sector: "Fintech" });
  });

  it("counts degree so the renderer can size nodes", () => {
    const { nodes } = buildGraph([
      co(1, { investors: ["Accel"], tags: ["Drones"] }),
      co(2, { investors: ["Accel"], tags: ["Drones"] }),
    ]);
    expect(nodes.find((n) => n.id === "c:1")!.degree).toBe(2);
    expect(nodes.find((n) => n.id === "i:accel")!.degree).toBe(2);
  });

  it("is deterministic so stored layouts do not shuffle between runs", () => {
    const companies = [
      co(3, { investors: ["B Cap", "A Cap"], tags: ["Zeta"] }),
      co(1, { investors: ["A Cap", "B Cap"], tags: ["Zeta"] }),
    ];
    const a = buildGraph(companies);
    const b = buildGraph([...companies].reverse());
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.edges).toEqual(b.edges);
  });
});
