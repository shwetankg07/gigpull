import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { Db } from "../db/index.js";
import { buildLeadViews } from "./view.js";
import { setStatus, rateLead, type LeadStatus } from "../track/leads.js";
import { setNotes } from "../track/notes.js";
import { PAGE_HTML } from "./page.js";

const VALID_STATUSES: LeadStatus[] = [
  "new", "shortlisted", "contacted", "replied", "dead",
];

function json(res: ServerResponse, code: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

export function createWebServer(db: Db): Server {
  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;

      if (req.method === "GET" && path === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(PAGE_HTML);
        return;
      }

      if (req.method === "GET" && path === "/api/leads") {
        json(res, 200, buildLeadViews(db));
        return;
      }

      const action = path.match(/^\/api\/leads\/(\d+)\/(status|rate|notes)$/);
      if (req.method === "POST" && action) {
        const companyId = Number(action[1]);
        const body = (await readBody(req)) as Record<string, unknown>;

        if (action[2] === "status") {
          const status = body.status as LeadStatus;
          if (!VALID_STATUSES.includes(status)) {
            json(res, 400, { error: `invalid status "${String(status)}"` });
            return;
          }
          setStatus(db, companyId, status, new Date());
        } else if (action[2] === "rate") {
          rateLead(db, companyId, body.rating === -1 ? -1 : 1);
        } else {
          setNotes(db, companyId, String(body.notes ?? ""));
        }

        json(res, 200, { ok: true });
        return;
      }

      json(res, 404, { error: "not found" });
    })().catch((e: unknown) => {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    });
  });
}

export function startWebServer(db: Db, port: number): Promise<Server> {
  const server = createWebServer(db);
  return new Promise((resolve) => {
    // Bound to loopback on purpose: the database holds third-party contact
    // details and the server has no authentication.
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
