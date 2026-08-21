import { groupByCanonical } from "./canonical.js";

/**
 * Builds the startup graph: companies joined through the things they share.
 *
 * Both edge kinds are drawn as stars through a hub node rather than as
 * pairwise lines between companies. This is not only cheaper — 4,591 pairwise
 * investor edges collapse to 751 — it says more. A line to a hub labelled
 * "Peak XV Partners" tells you why two companies are connected; an anonymous
 * line between them does not.
 */

export interface GraphCompany {
  id: number;
  name: string;
  sector: string | null;
  investors: string[];
  tags: string[];
}

export type GraphNodeKind = "company" | "investor" | "tag";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  companyId?: number;
  sector?: string | null;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "investor" | "tag";
}

/** A hub joining fewer than two companies joins nothing. */
export const MIN_HUB_MEMBERS = 2;

/**
 * Above this, a tag has stopped describing a niche and started describing an
 * industry. 'saas' has 133 members upstream and 'ai' 117 — as hubs they pull
 * a third of the graph into one blob while saying only what the sector colour
 * already says. At 8 the surviving hubs are things like 'mlops', 'satellites'
 * and 'semiconductor', which are exactly the neighbours worth seeing.
 */
export const MAX_TAG_MEMBERS = 8;

export function buildGraph(companies: GraphCompany[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const ordered = [...companies].sort((a, b) => a.id - b.id);

  const nodes: GraphNode[] = ordered.map((c) => ({
    id: `c:${c.id}`,
    kind: "company",
    label: c.name,
    companyId: c.id,
    sector: c.sector,
    degree: 0,
  }));

  const edges: GraphEdge[] = [];

  const addHubs = (
    prefix: string,
    kind: "investor" | "tag",
    pick: (c: GraphCompany) => string[],
    maxMembers: number,
  ) => {
    const groups = groupByCanonical(
      ordered.flatMap((c) => pick(c).map((name) => ({ name, ownerId: c.id }))),
    );
    for (const g of groups) {
      if (g.ownerIds.length < MIN_HUB_MEMBERS || g.ownerIds.length > maxMembers) continue;
      const hubId = `${prefix}:${g.key}`;
      nodes.push({ id: hubId, kind, label: g.display, degree: g.ownerIds.length });
      for (const ownerId of [...g.ownerIds].sort((a, b) => a - b)) {
        edges.push({ source: `c:${ownerId}`, target: hubId, kind });
      }
    }
  };

  addHubs("i", "investor", (c) => c.investors, Number.POSITIVE_INFINITY);
  addHubs("t", "tag", (c) => c.tags, MAX_TAG_MEMBERS);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const source = byId.get(e.source);
    if (source) source.degree++;
  }

  return { nodes, edges };
}
