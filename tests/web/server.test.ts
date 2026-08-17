import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Server } from "node:http";
import { openDb, companies, scores, leads } from "../../src/db/index.js";
import { createWebServer } from "../../src/web/server.js";
import { eq } from "drizzle-orm";

const iso = "2026-08-16T00:00:00Z";
let server: Server;
let base: string;
let db: ReturnType<typeof openDb>;

beforeEach(async () => {
  db = openDb(":memory:");
  const id = db.insert(companies).values({
    identityKey: "osm:node/1", mode: "local", name: "Example Tiffin Room",
    createdAt: iso, updatedAt: iso,
  }).returning({ id: companies.id }).get().id;
  db.insert(scores).values({
    companyId: id, total: 120, breakdownJson: "{}",
    weightsVersion: "v1", scoredAt: iso,
  }).run();
  db.insert(leads).values({ companyId: id, status: "new" }).run();

  server = createWebServer(db);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("web server", () => {
  it("serves the page at /", async () => {
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("gigpull");
  });

  it("returns leads as json", async () => {
    const res = await fetch(base + "/api/leads");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Example Tiffin Room");
  });

  it("updates a lead status", async () => {
    const res = await fetch(base + "/api/leads/1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "contacted" }),
    });
    expect(res.status).toBe(200);
    expect(db.select().from(leads).where(eq(leads.companyId, 1)).get()!.status)
      .toBe("contacted");
  });

  it("rejects an unknown status instead of writing it", async () => {
    const res = await fetch(base + "/api/leads/1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "banana" }),
    });
    expect(res.status).toBe(400);
    expect(db.select().from(leads).where(eq(leads.companyId, 1)).get()!.status)
      .toBe("new");
  });

  it("stores a rating", async () => {
    await fetch(base + "/api/leads/1/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: -1 }),
    });
    expect(db.select().from(leads).where(eq(leads.companyId, 1)).get()!.rating).toBe(-1);
  });

  it("stores notes", async () => {
    await fetch(base + "/api/leads/1/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "called, ask for Ravi" }),
    });
    expect(db.select().from(leads).where(eq(leads.companyId, 1)).get()!.notes)
      .toBe("called, ask for Ravi");
  });

  it("404s an unknown route", async () => {
    expect((await fetch(base + "/nope")).status).toBe(404);
  });

  it("survives a malformed json body without crashing", async () => {
    const res = await fetch(base + "/api/leads/1/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(200);
  });
});
