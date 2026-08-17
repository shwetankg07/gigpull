import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;
export * from "./schema.js";

const DDL = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, identity_key TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL, name TEXT NOT NULL, city TEXT, category TEXT,
  website TEXT, source_url TEXT, lat REAL, lon REAL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS companies_mode_idx ON companies(mode);
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),
  source TEXT NOT NULL, kind TEXT NOT NULL, value_json TEXT NOT NULL, observed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS signals_company_idx ON signals(company_id);
CREATE TABLE IF NOT EXISTS probes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL, ok INTEGER NOT NULL, result_json TEXT NOT NULL,
  ran_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),
  total REAL NOT NULL, breakdown_json TEXT NOT NULL, weights_version TEXT NOT NULL,
  scored_at TEXT NOT NULL, rerank_verdict TEXT, rerank_reason TEXT,
  rerank_adjustment REAL, rerank_fit TEXT, adjusted_total REAL,
  reranked_at TEXT, rerank_signal_hash TEXT);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  status TEXT NOT NULL DEFAULT 'new', brief_md TEXT, rating INTEGER,
  contacted_at TEXT, follow_up_at TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, collector TEXT NOT NULL, mode TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, ok INTEGER, item_count INTEGER, error TEXT);
`;

/**
 * Columns added after the first release. CREATE TABLE IF NOT EXISTS does nothing
 * to a table that already exists, so an existing database would silently keep
 * the old shape and every write to a new column would fail. Each entry is
 * applied only when absent, so this is safe to run on every open.
 */
const ADDED_COLUMNS: Array<[table: string, column: string, ddl: string]> = [
  ["companies", "source_url", "ALTER TABLE companies ADD COLUMN source_url TEXT"],
  ["companies", "lat", "ALTER TABLE companies ADD COLUMN lat REAL"],
  ["companies", "lon", "ALTER TABLE companies ADD COLUMN lon REAL"],
  ["scores", "rerank_fit", "ALTER TABLE scores ADD COLUMN rerank_fit TEXT"],
];

function migrate(sqlite: Database.Database): void {
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) sqlite.exec(ddl);
  }
}

export function openDb(path = "gigpull.db"): Db {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  migrate(sqlite);
  return drizzle(sqlite, { schema });
}
