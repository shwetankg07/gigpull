import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const STATUSES = new Set(["new", "shortlisted", "contacted", "replied", "dead"]);
const INTENTS = new Set(["job", "gig", "interesting"]);

/**
 * Updates one lead's status or intent.
 *
 * The middleware already redirects unauthenticated page requests, but an API
 * route is reachable directly, so it checks the session itself rather than
 * assuming something upstream did.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const companyId = Number((await ctx.params).id);
  if (!Number.isInteger(companyId)) {
    return NextResponse.json({ error: "bad company id" }, { status: 400 });
  }

  const body = (await request.json()) as { status?: unknown; intent?: unknown };
  const updates: string[] = [];

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "unknown status" }, { status: 400 });
    }
    updates.push("status");
  }

  let intent: string[] | null = null;
  if (body.intent !== undefined) {
    if (!Array.isArray(body.intent) || body.intent.some((i) => !INTENTS.has(String(i)))) {
      return NextResponse.json({ error: "unknown intent" }, { status: 400 });
    }
    intent = [...new Set(body.intent.map(String))].sort();
    updates.push("intent");
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  // A company collected but never touched has no leads row yet, so this is an
  // upsert rather than an update.
  await db.execute(sql`
    INSERT INTO leads (company_id, status, intent)
    VALUES (
      ${companyId},
      ${body.status !== undefined ? String(body.status) : "new"},
      ${intent === null ? "[]" : JSON.stringify(intent)}
    )
    ON CONFLICT (company_id) DO UPDATE SET
      status = ${body.status !== undefined ? String(body.status) : sql`leads.status`},
      intent = ${intent === null ? sql`leads.intent` : JSON.stringify(intent)}
  `);

  return NextResponse.json({ ok: true });
}
