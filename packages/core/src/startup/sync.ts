import type { RawCandidate } from "../core/types.js";
import type { Collector, RunContext } from "../collect/types.js";
import { nearestAnchorKm, type Point } from "../core/geo.js";
import {
  scoreStartup, parseFundingUsd,
  type StartupScoreInput, type StartupScoreResult,
} from "../score/startupScorer.js";
import { buildGraph, type GraphCompany, type GraphEdge, type GraphNode } from "../graph/edges.js";
import { computeLayout } from "../graph/layout.js";

/**
 * Fills the startup tab: collect, score, then rebuild the graph.
 *
 * Everything here is orchestration. The store is injected so this can be
 * exercised without a database, and so the Postgres SQL lives in one file
 * rather than being smeared through the pipeline.
 */

export interface PlacedNode extends GraphNode {
  x: number;
  y: number;
}

export interface StartupStore {
  /** Returns the company's stable id, inserting it if new. */
  upsertCompany(candidate: RawCandidate): Promise<number>;
  replaceSignals(companyId: number, signals: RawCandidate["signals"], observedAt: string): Promise<void>;
  replaceContacts(companyId: number, contacts: RawCandidate["contacts"]): Promise<void>;
  insertScore(companyId: number, result: StartupScoreResult, scoredAt: string): Promise<void>;
  replaceGraph(nodes: PlacedNode[], edges: GraphEdge[]): Promise<void>;
}

export interface SyncOptions {
  anchors?: Point[];
  now?: Date;
}

export interface SyncSummary {
  collected: number;
  scored: number;
  nodes: number;
  edges: number;
}

const signalValue = (c: RawCandidate, kind: string): unknown =>
  c.signals.find((s) => s.kind === kind)?.value;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** Reduces a collected record to the inputs the scorer is allowed to see. */
export function toScoreInput(c: RawCandidate, anchors: Point[]): StartupScoreInput {
  return {
    stage: asString(signalValue(c, "stage")) as StartupScoreInput["stage"],
    teamSize: asString(signalValue(c, "team_size")) as StartupScoreInput["teamSize"],
    status: asString(signalValue(c, "status")) as StartupScoreInput["status"],
    fundingUsd: parseFundingUsd(asString(signalValue(c, "total_funding"))),
    hasJobsUrl: signalValue(c, "has_open_role") === true,
    hasLinkedin: c.contacts.some((x) => x.type === "linkedin"),
    hasFounderLink: c.contacts.some((x) => x.type === "founder_linkedin"),
    hasWebsite: signalValue(c, "has_website") === true,
    distanceKm: nearestAnchorKm(
      c.lat != null && c.lon != null ? { lat: c.lat, lon: c.lon } : null,
      anchors,
    ),
  };
}

export async function syncStartups(
  collector: Collector,
  store: StartupStore,
  ctx: RunContext,
  options: SyncOptions = {},
): Promise<SyncSummary> {
  const anchors = options.anchors ?? [];
  const now = (options.now ?? new Date()).toISOString();

  const collected: Array<{ id: number; candidate: RawCandidate }> = [];

  for await (const candidate of collector.run(ctx)) {
    const id = await store.upsertCompany(candidate);
    await store.replaceSignals(id, candidate.signals, now);
    await store.replaceContacts(id, candidate.contacts);
    collected.push({ id, candidate });
  }

  for (const { id, candidate } of collected) {
    await store.insertScore(id, scoreStartup(toScoreInput(candidate, anchors)), now);
  }

  const graphCompanies: GraphCompany[] = collected.map(({ id, candidate }) => ({
    id,
    name: candidate.name,
    sector: asString(signalValue(candidate, "sector")),
    investors: (signalValue(candidate, "investors") as string[]) ?? [],
    tags: (signalValue(candidate, "tags") as string[]) ?? [],
  }));

  const { nodes, edges } = buildGraph(graphCompanies);
  const positions = computeLayout(nodes, edges);

  // Investor hubs that are themselves companies in this dataset get linked to
  // their own record, so clicking one opens a real page rather than a label.
  const companyIdByName = new Map(
    collected.map(({ id, candidate }) => [candidate.name.trim().toLowerCase(), id]),
  );

  const placed: PlacedNode[] = nodes.map((n) => ({
    ...n,
    companyId: n.companyId ?? (n.kind === "investor"
      ? companyIdByName.get(n.label.trim().toLowerCase()) ?? undefined
      : undefined),
    ...(positions.get(n.id) ?? { x: 0, y: 0 }),
  }));

  await store.replaceGraph(placed, edges);

  return {
    collected: collected.length,
    scored: collected.length,
    nodes: placed.length,
    edges: edges.length,
  };
}
