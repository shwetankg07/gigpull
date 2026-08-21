import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, companies } from "../../src/db/index.js";

describe("migrations", () => {
  it("adds new columns to a database created before they existed", () => {
    const path = join(mkdtempSync(join(tmpdir(), "gigpull-")), "old.db");

    // A database in the pre-links shape: no source_url, lat, lon or rerank_fit.
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT, identity_key TEXT NOT NULL UNIQUE,
        mode TEXT NOT NULL, name TEXT NOT NULL, city TEXT, category TEXT,
        website TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO companies (identity_key, mode, name, created_at, updated_at)
        VALUES ('osm:node/1', 'local', 'Legacy Cafe', '2026-01-01', '2026-01-01');
    `);
    legacy.close();

    const db = openDb(path);
    const cols = new Database(path)
      .prepare("PRAGMA table_info(companies)").all() as Array<{ name: string }>;

    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(["source_url", "lat", "lon"]));

    // The pre-existing row survives and the new columns are writable.
    const rows = db.select().from(companies).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Legacy Cafe");
    expect(rows[0]!.lat).toBeNull();
  });

  it("is idempotent — opening twice does not fail", () => {
    const path = join(mkdtempSync(join(tmpdir(), "gigpull-")), "twice.db");
    openDb(path);
    expect(() => openDb(path)).not.toThrow();
  });
});
