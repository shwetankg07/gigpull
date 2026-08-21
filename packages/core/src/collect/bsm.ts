import { z } from "zod";
import type { RawCandidate, RawSignal } from "../core/types.js";
import type { Collector, RunContext } from "./types.js";
import { fetchWithBackoff } from "../core/http.js";

export const BSM_SOURCE_URL = "https://bangalorestartupmap.com";

/**
 * bangalorestartupmap.com is a Next.js app that server-renders its whole
 * dataset — 957 companies and funds — into the React flight stream inlined in
 * the page. There is no JSON API behind it: /api/startups, /startups.json and
 * three other spellings all return 404, so this payload is the only way in.
 *
 * That makes the parser a boundary against someone else's private format,
 * which is exactly what the zod schema below is for. If the site changes
 * shape the collector throws and the run records a failed collector, rather
 * than quietly yielding nothing and emptying the tab.
 */
const YearSchema = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return v.trim() && Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}, z.number().int().optional());

const RecordSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  kind: z.string().default("startup"),
  tagline: z.string().default(""),
  description: z.string().default(""),
  stage: z.string().optional(),
  sector: z.string().optional(),
  tags: z.array(z.string()).default([]),
  area: z.string().default(""),
  hsr_location: z.string().optional(),
  address: z.string().optional(),
  // 107 of the 957 live records carry `""` here instead of a year, and one
  // could plausibly arrive as "2019". Coercing at the boundary keeps that
  // upstream sloppiness from reaching anything downstream.
  founded_year: YearSchema,
  team_size: z.string().optional(),
  total_funding: z.string().optional(),
  fund_size: z.string().optional(),
  website: z.string().default(""),
  jobs_url: z.string().default(""),
  linkedin: z.string().default(""),
  founders: z.string().default(""),
  founder_links: z.array(z.object({ name: z.string(), url: z.string() })).default([]),
  investors: z.array(z.string()).default([]),
  status: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const PayloadSchema = z.object({ startups: z.array(RecordSchema) });

export type BsmRecord = z.infer<typeof RecordSchema>;

/**
 * Concatenates every flight chunk in the page, in document order.
 *
 * Next pushes the stream as `self.__next_f.push([1, "<chunk>"])` and may split
 * it at any byte. Today's page happens to emit one 840KB chunk, so a parser
 * that grabbed the largest script would pass — right up until a rebuild split
 * the payload and it started returning nothing.
 */
function readFlightStream(html: string): string {
  const chunks: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\((\[1,.*?\])\)/gs)) {
    try {
      const parsed = JSON.parse(m[1]!) as [number, string];
      if (typeof parsed[1] === "string") chunks.push(parsed[1]);
    } catch {
      // A chunk we cannot parse is not fatal on its own; the payload check
      // below decides whether enough of the stream survived to be usable.
    }
  }
  return chunks.join("");
}

/**
 * Extracts the `{"startups":[...]}` object by brace matching.
 *
 * Anchoring on the property name rather than on the flight row prefix (`4:`)
 * or on the surrounding React element tuple means the parser survives the
 * payload moving to a different row or gaining sibling props — both of which
 * are ordinary Next build details, not meaningful changes to the data.
 */
function extractPayloadObject(flight: string): string {
  const key = flight.indexOf('"startups"');
  if (key === -1) throw new Error("bsm: no startups payload found in page");

  const open = flight.lastIndexOf("{", key);
  if (open === -1) throw new Error("bsm: malformed startups payload");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < flight.length; i++) {
    const ch = flight[i]!;
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return flight.slice(open, i + 1);
  }
  throw new Error("bsm: unterminated startups payload");
}

const NON_EMPTY = (s: string | undefined): string | null => (s && s.trim() ? s.trim() : null);

function toCandidate(r: BsmRecord): RawCandidate {
  const website = NON_EMPTY(r.website);
  const jobsUrl = NON_EMPTY(r.jobs_url);

  const signals: RawSignal[] = [
    { kind: "has_website", value: Boolean(website) },
    { kind: "has_open_role", value: Boolean(jobsUrl) },
    { kind: "tags", value: r.tags },
    { kind: "investors", value: r.investors },
    { kind: "area", value: r.area },
  ];

  const optional: Array<[string, unknown]> = [
    ["stage", r.stage], ["sector", r.sector], ["team_size", r.team_size],
    ["total_funding", r.total_funding], ["fund_size", r.fund_size],
    ["status", r.status], ["founded_year", r.founded_year],
    ["founders", NON_EMPTY(r.founders)], ["jobs_url", jobsUrl],
    ["tagline", NON_EMPTY(r.tagline)], ["description", NON_EMPTY(r.description)],
    ["hsr_location", NON_EMPTY(r.hsr_location)],
  ];
  for (const [kind, value] of optional) {
    if (value !== undefined && value !== null) signals.push({ kind, value });
  }

  const contacts: Array<{ type: string; value: string }> = [];
  const linkedin = NON_EMPTY(r.linkedin);
  if (linkedin) contacts.push({ type: "linkedin", value: linkedin });
  for (const f of r.founder_links) {
    if (f.url.trim()) contacts.push({ type: "founder_linkedin", value: f.url.trim() });
  }

  return {
    mode: "startup",
    identityKey: `bsm:${r.slug}`,
    name: r.name,
    website,
    // `area` is the neighbourhood, which is the useful grain here — every
    // record's city is Bangalore, so storing that would carry no information.
    city: NON_EMPTY(r.area),
    category: r.kind,
    source: "bsm",
    sourceUrl: `${BSM_SOURCE_URL}/company/${r.slug}`,
    lat: r.lat ?? null,
    lon: r.lng ?? null,
    signals,
    contacts,
  };
}

export function parseBsmPage(html: string): RawCandidate[] {
  const flight = readFlightStream(html);
  if (!flight) throw new Error("bsm: no flight payload found in page");
  const { startups } = PayloadSchema.parse(JSON.parse(extractPayloadObject(flight)));
  return startups.map(toCandidate);
}

export function createBsmCollector(): Collector {
  return {
    name: "bsm",
    mode: "startup",
    async *run(ctx: RunContext) {
      const res = await fetchWithBackoff(
        `${BSM_SOURCE_URL}/`,
        { headers: { "User-Agent": ctx.config.userAgent } },
        { attempts: 3, baseDelayMs: 2_000 },
      );
      if (!res.ok) throw new Error(`bsm: HTTP ${res.status}`);
      for (const candidate of parseBsmPage(await res.text())) yield candidate;
    },
  };
}
