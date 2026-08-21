import type { Sql } from "postgres";
import type { StartupStore, PlacedNode } from "./sync.js";
import type { GraphEdge } from "../graph/edges.js";

/**
 * Postgres implementation of the startup store.
 *
 * Kept deliberately thin: all the SQL for this feature lives here, and the
 * orchestration in sync.ts stays database-free and testable.
 */
export function createPgStartupStore(sql: Sql): StartupStore {
  return {
    async upsertCompany(c) {
      const now = new Date().toISOString();
      // Identity key, never name — the same company under two spellings must
      // not become two rows, and a renamed company must not become a new one.
      const rows = await sql<Array<{ id: number }>>`
        INSERT INTO companies (
          identity_key, mode, name, city, category, website, source_url,
          lat, lon, created_at, updated_at
        ) VALUES (
          ${c.identityKey}, ${c.mode}, ${c.name}, ${c.city ?? null},
          ${c.category ?? null}, ${c.website ?? null}, ${c.sourceUrl ?? null},
          ${c.lat ?? null}, ${c.lon ?? null}, ${now}, ${now}
        )
        ON CONFLICT (identity_key) DO UPDATE SET
          name = EXCLUDED.name, city = EXCLUDED.city,
          category = EXCLUDED.category, website = EXCLUDED.website,
          source_url = EXCLUDED.source_url, lat = EXCLUDED.lat,
          lon = EXCLUDED.lon, updated_at = EXCLUDED.updated_at
        RETURNING id
      `;
      return rows[0]!.id;
    },

    async replaceSignals(companyId, signals, observedAt) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM signals WHERE company_id = ${companyId} AND source = 'bsm'`;
        if (signals.length === 0) return;
        await tx`INSERT INTO signals ${tx(
          signals.map((s) => ({
            company_id: companyId, source: "bsm", kind: s.kind,
            value_json: JSON.stringify(s.value ?? null), observed_at: observedAt,
          })),
        )}`;
      });
    },

    async replaceContacts(companyId, contacts) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM contacts WHERE company_id = ${companyId} AND source = 'bsm'`;
        if (contacts.length === 0) return;
        await tx`INSERT INTO contacts ${tx(
          contacts.map((x) => ({
            company_id: companyId, type: x.type, value: x.value, source: "bsm",
          })),
        )}`;
      });
    },

    async insertScore(companyId, result, scoredAt) {
      await sql`
        INSERT INTO scores (
          company_id, total, breakdown_json, weights_version, scored_at, adjusted_total
        ) VALUES (
          ${companyId}, ${result.total}, ${JSON.stringify(result.axes)},
          ${result.weightsVersion}, ${scoredAt}, ${result.total}
        )
      `;
    },

    async replaceGraph(nodes: PlacedNode[], edges: GraphEdge[]) {
      // One transaction: a half-rebuilt graph would render as a map with
      // edges pointing at nodes that no longer exist.
      await sql.begin(async (tx) => {
        await tx`DELETE FROM graph_edges`;
        await tx`DELETE FROM graph_nodes`;
        if (nodes.length) {
          await tx`INSERT INTO graph_nodes ${tx(
            nodes.map((n) => ({
              id: n.id, kind: n.kind, label: n.label,
              company_id: n.companyId ?? null, sector: n.sector ?? null,
              degree: n.degree, x: n.x, y: n.y,
            })),
          )}`;
        }
        if (edges.length) {
          await tx`INSERT INTO graph_edges ${tx(
            edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind })),
          )}`;
        }
      });
    },
  };
}
