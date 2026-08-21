import {
  pgTable, text, integer, real, serial, index, uniqueIndex, boolean,
} from "drizzle-orm/pg-core";

/**
 * Postgres mirror of schema.ts, for the deployed web app.
 *
 * Drizzle cannot share table definitions across dialects, so the two files
 * are written out separately and kept honest by tests/db/schemaParity.test.ts,
 * which fails when a column exists on one side and not the other. The
 * duplication is temporary: it lasts until the local-business tab moves off
 * SQLite too.
 *
 * Timestamps stay `text` rather than becoming `timestamp` so that both
 * dialects store the identical ISO strings the pipeline already writes.
 */

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    identityKey: text("identity_key").notNull().unique(),
    mode: text("mode").notNull(),
    name: text("name").notNull(),
    city: text("city"),
    category: text("category"),
    website: text("website"),
    sourceUrl: text("source_url"),
    lat: real("lat"),
    lon: real("lon"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({ modeIdx: index("companies_mode_idx").on(t.mode) }),
);

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    valueJson: text("value_json").notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (t) => ({ companyIdx: index("signals_company_idx").on(t.companyId) }),
);

export const probes = pgTable("probes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  kind: text("kind").notNull(),
  ok: boolean("ok").notNull(),
  resultJson: text("result_json").notNull(),
  ranAt: text("ran_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  type: text("type").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull(),
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  total: real("total").notNull(),
  breakdownJson: text("breakdown_json").notNull(),
  weightsVersion: text("weights_version").notNull(),
  scoredAt: text("scored_at").notNull(),
  rerankVerdict: text("rerank_verdict"),
  rerankReason: text("rerank_reason"),
  rerankAdjustment: real("rerank_adjustment"),
  rerankFit: text("rerank_fit"),
  adjustedTotal: real("adjusted_total"),
  rerankedAt: text("reranked_at"),
  rerankSignalHash: text("rerank_signal_hash"),
});

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id).unique(),
  status: text("status").notNull().default("new"),
  briefMd: text("brief_md"),
  rating: integer("rating"),
  contactedAt: text("contacted_at"),
  followUpAt: text("follow_up_at"),
  notes: text("notes"),
  /**
   * Why this company is on the board: any of job / gig / interesting, stored
   * as a sorted JSON array. One company can be more than one of these, which
   * is why it is not a single enum column.
   */
  intent: text("intent").notNull().default("[]"),
});

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  collector: text("collector").notNull(),
  mode: text("mode").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  ok: boolean("ok"),
  itemCount: integer("item_count"),
  error: text("error"),
});

/**
 * The startup graph, materialised.
 *
 * Positions are computed by the worker and stored, not simulated in the
 * browser — at ~1,400 nodes a client-side simulation is a slideshow, and a
 * stored layout is identical for every viewer and testable besides.
 */
export const graphNodes = pgTable(
  "graph_nodes",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    /** Set for company nodes, and for investor hubs that are themselves in the dataset. */
    companyId: integer("company_id").references(() => companies.id),
    sector: text("sector"),
    degree: integer("degree").notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
  },
  (t) => ({ kindIdx: index("graph_nodes_kind_idx").on(t.kind) }),
);

export const graphEdges = pgTable(
  "graph_edges",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    kind: text("kind").notNull(),
  },
  (t) => ({
    pairIdx: uniqueIndex("graph_edges_pair_idx").on(t.source, t.target, t.kind),
    sourceIdx: index("graph_edges_source_idx").on(t.source),
  }),
);
