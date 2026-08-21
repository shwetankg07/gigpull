import { describe, it, expect } from "vitest";
import { getTableColumns, type Table } from "drizzle-orm";
import * as sqlite from "../../src/db/schema.js";
import * as pg from "../../src/db/schema.pg.js";

/**
 * Tables that must exist identically in both dialects. graph_nodes and
 * graph_edges are Postgres-only: the local-business tab has no graph, and
 * mirroring them into SQLite would be dead weight.
 */
const SHARED = [
  "companies", "signals", "probes", "contacts", "scores", "leads", "runs",
] as const;

/** Columns added for the deployed app that the SQLite tab does not yet have. */
const PG_ONLY: Record<string, string[]> = { leads: ["intent"] };

const columnsOf = (t: Table) => Object.values(getTableColumns(t)).map((c) => c.name).sort();

describe("schema parity", () => {
  // Drizzle cannot share table definitions across dialects, so the two schema
  // files are written twice. Two files that must agree and are never compared
  // will diverge — quietly, and only in production. This is the comparison.
  it.each(SHARED)("%s has the same columns in both dialects", (name) => {
    const a = columnsOf(sqlite[name] as unknown as Table);
    const b = columnsOf(pg[name] as unknown as Table).filter(
      (c) => !(PG_ONLY[name] ?? []).includes(c),
    );
    expect(b).toEqual(a);
  });

  it("declares every shared table on both sides", () => {
    for (const name of SHARED) {
      expect(sqlite[name], `${name} missing from schema.ts`).toBeDefined();
      expect(pg[name], `${name} missing from schema.pg.ts`).toBeDefined();
    }
  });

  it("keeps the graph tables Postgres-only", () => {
    expect(pg.graphNodes).toBeDefined();
    expect(pg.graphEdges).toBeDefined();
    expect("graphNodes" in sqlite).toBe(false);
  });

  it("records lead intent as a column the web app can filter on", () => {
    expect(columnsOf(pg.leads as unknown as Table)).toContain("intent");
  });
});
