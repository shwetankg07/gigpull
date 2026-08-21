import { sql } from "drizzle-orm";
import { db } from "./db";

export interface StartupLead {
  companyId: number;
  name: string;
  website: string | null;
  area: string | null;
  sourceUrl: string | null;
  lat: number | null;
  lon: number | null;
  total: number;
  breakdown: Record<string, number>;
  rerankReason: string | null;
  rerankFit: string | null;
  status: string;
  intent: string[];
  briefMd: string | null;
  signals: Record<string, unknown>;
  contacts: Array<{ type: string; value: string }>;
}

/**
 * The startup board, one row per company.
 *
 * DISTINCT ON picks the newest score per company. Every pipeline run inserts
 * a fresh scores row, so a plain join returns one row per historical score —
 * which on the local tab once produced 780 rows for 670 leads, each lead
 * appearing once for every time it had ever been scored.
 */
export async function getStartupLeads(): Promise<StartupLead[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH newest AS (
      SELECT DISTINCT ON (company_id)
             company_id, adjusted_total, total, breakdown_json,
             rerank_reason, rerank_fit
      FROM scores
      ORDER BY company_id, scored_at DESC, id DESC
    )
    SELECT c.id            AS company_id,
           c.name, c.website, c.city AS area, c.source_url, c.lat, c.lon,
           COALESCE(n.adjusted_total, n.total, 0) AS total,
           n.breakdown_json, n.rerank_reason, n.rerank_fit,
           COALESCE(l.status, 'new')  AS status,
           COALESCE(l.intent, '[]')   AS intent,
           l.brief_md,
           COALESCE((SELECT json_object_agg(s.kind, s.value_json::json)
                     FROM signals s WHERE s.company_id = c.id), '{}'::json) AS signals,
           COALESCE((SELECT json_agg(json_build_object('type', ct.type, 'value', ct.value))
                     FROM contacts ct WHERE ct.company_id = c.id), '[]'::json) AS contacts
    FROM companies c
    LEFT JOIN newest n ON n.company_id = c.id
    LEFT JOIN leads  l ON l.company_id = c.id
    WHERE c.mode = 'startup'
    ORDER BY COALESCE(n.adjusted_total, n.total, 0) DESC
  `);

  return rows.map((r) => ({
    companyId: Number(r.company_id),
    name: String(r.name),
    website: (r.website as string) ?? null,
    area: (r.area as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    lat: r.lat === null ? null : Number(r.lat),
    lon: r.lon === null ? null : Number(r.lon),
    total: Number(r.total ?? 0),
    breakdown: safeJson(r.breakdown_json, {}) as Record<string, number>,
    rerankReason: (r.rerank_reason as string) ?? null,
    rerankFit: (r.rerank_fit as string) ?? null,
    status: String(r.status ?? "new"),
    intent: safeJson(r.intent, []) as string[],
    briefMd: (r.brief_md as string) ?? null,
    signals: (r.signals ?? {}) as Record<string, unknown>,
    contacts: (r.contacts ?? []) as Array<{ type: string; value: string }>,
  }));
}

export interface GraphPayload {
  nodes: Array<{
    id: string; kind: string; label: string; companyId: number | null;
    sector: string | null; degree: number; x: number; y: number;
  }>;
  edges: Array<{ source: string; target: string; kind: string }>;
}

export async function getGraph(): Promise<GraphPayload> {
  const [nodes, edges] = await Promise.all([
    db.execute<Record<string, unknown>>(
      sql`SELECT id, kind, label, company_id, sector, degree, x, y FROM graph_nodes`,
    ),
    db.execute<Record<string, unknown>>(
      sql`SELECT source, target, kind FROM graph_edges`,
    ),
  ]);

  return {
    nodes: nodes.map((n) => ({
      id: String(n.id), kind: String(n.kind), label: String(n.label),
      companyId: n.company_id === null ? null : Number(n.company_id),
      sector: (n.sector as string) ?? null,
      degree: Number(n.degree), x: Number(n.x), y: Number(n.y),
    })),
    edges: edges.map((e) => ({
      source: String(e.source), target: String(e.target), kind: String(e.kind),
    })),
  };
}

function safeJson(raw: unknown, fallback: unknown): unknown {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}
