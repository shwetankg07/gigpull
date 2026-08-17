import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    identityKey: text("identity_key").notNull().unique(),
    mode: text("mode", { enum: ["local", "startup"] }).notNull(),
    name: text("name").notNull(),
    city: text("city"),
    category: text("category"),
    website: text("website"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({ modeIdx: index("companies_mode_idx").on(t.mode) }),
);

export const signals = sqliteTable(
  "signals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id").notNull().references(() => companies.id),
    source: text("source").notNull(),
    kind: text("kind").notNull(),
    valueJson: text("value_json").notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (t) => ({ companyIdx: index("signals_company_idx").on(t.companyId) }),
);

export const probes = sqliteTable("probes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  kind: text("kind").notNull(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  resultJson: text("result_json").notNull(),
  ranAt: text("ran_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  type: text("type").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull(),
});

export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id).unique(),
  status: text("status", {
    enum: ["new", "shortlisted", "contacted", "replied", "dead"],
  }).notNull().default("new"),
  briefMd: text("brief_md"),
  rating: integer("rating"),
  contactedAt: text("contacted_at"),
  followUpAt: text("follow_up_at"),
  notes: text("notes"),
});

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collector: text("collector").notNull(),
  mode: text("mode").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  ok: integer("ok", { mode: "boolean" }),
  itemCount: integer("item_count"),
  error: text("error"),
});
