import { z } from "zod";
import type { RawCandidate } from "../core/types.js";
import type { Collector, RunContext } from "./types.js";

/**
 * Overpass mirrors, tried in order. The main instance is free, volunteer-run,
 * and returns 504 under load often enough that a single endpoint cannot be the
 * only source for local mode — the first live query during development hit one.
 */
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/**
 * OSM tag filters per gigpull category. Kept explicit rather than accepting
 * arbitrary tags: an unbounded filter would ask Overpass for a slice of the
 * whole planet, which is both rude to a free volunteer-run service and slow.
 */
export const OSM_CATEGORY_FILTERS: Record<string, string> = {
  restaurant: '["amenity"~"restaurant|cafe|fast_food"]',
  gym: '["leisure"="fitness_centre"]',
  salon: '["shop"~"hairdresser|beauty"]',
  clinic: '["amenity"~"clinic|doctors|dentist"]',
  bakery: '["shop"~"bakery|confectionery"]',
  hotel: '["tourism"~"hotel|guest_house"]',
  school: '["amenity"~"school|college|language_school"]',
  retail: '["shop"~"clothes|shoes|jewelry|furniture|electronics"]',
};

export function buildOverpassQuery(categories: string[], bbox: string): string {
  const clauses: string[] = [];

  for (const category of categories) {
    const filter = OSM_CATEGORY_FILTERS[category];
    if (!filter) {
      throw new Error(
        `unknown OSM category "${category}" — known: ${Object.keys(OSM_CATEGORY_FILTERS).join(", ")}`,
      );
    }
    clauses.push(`  node${filter}(${bbox});`);
    clauses.push(`  way${filter}(${bbox});`);
  }

  return ["[out:json][timeout:90];", "(", ...clauses, ");", "out center tags;"].join("\n");
}

const ElementSchema = z.object({
  type: z.string(),
  id: z.number(),
  tags: z.record(z.string()).optional(),
});

const ResponseSchema = z.object({ elements: z.array(ElementSchema) });

const CATEGORY_TAGS = ["shop", "amenity", "leisure", "tourism", "healthcare", "office"];

const SOCIAL_TAGS: Array<{ tag: string; type: string; re: RegExp }> = [
  { tag: "contact:instagram", type: "instagram", re: /instagram\.com\/([A-Za-z0-9._]+)/i },
  { tag: "contact:facebook", type: "facebook", re: /facebook\.com\/([A-Za-z0-9._-]+)/i },
];

export function parseOverpassResponse(json: unknown): RawCandidate[] {
  const parsed = ResponseSchema.parse(json);
  const out: RawCandidate[] = [];

  for (const el of parsed.elements) {
    const tags = el.tags ?? {};
    const name = tags.name;
    // An unnamed element cannot be researched or contacted, so it is not a lead.
    if (!name) continue;

    const website = tags.website ?? tags["contact:website"] ?? null;

    const contacts: Array<{ type: string; value: string }> = [];
    const phone = tags.phone ?? tags["contact:phone"];
    if (phone) contacts.push({ type: "phone", value: phone });
    const email = tags.email ?? tags["contact:email"];
    if (email) contacts.push({ type: "email", value: email });
    for (const { tag, type, re } of SOCIAL_TAGS) {
      const raw = tags[tag];
      if (!raw) continue;
      const handle = raw.match(re)?.[1] ?? raw;
      contacts.push({ type, value: handle });
    }

    const category = CATEGORY_TAGS.map((t) => tags[t]).find(Boolean) ?? null;
    const city = tags["addr:suburb"] ?? tags["addr:city"] ?? null;

    out.push({
      mode: "local",
      identityKey: `osm:${el.type}/${el.id}`,
      name,
      website,
      city,
      category,
      source: "osm_overpass",
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      signals: [{ kind: "has_website", value: Boolean(website) }],
      contacts,
    });
  }

  return out;
}

export async function fetchOverpass(query: string): Promise<unknown> {
  const failures: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Overpass is a free volunteer service and asks that clients identify
          // themselves, so abuse traces to a tool rather than blocking everyone.
          "User-Agent": "gigpull/0.1 (+https://github.com/shwetankg07)",
        },
        body: new URLSearchParams({ data: query }),
      });

      if (!res.ok) {
        failures.push(`${endpoint} -> HTTP ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      failures.push(`${endpoint} -> ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(`all overpass mirrors failed: ${failures.join("; ")}`);
}

export function createOsmCollector(categories: string[]): Collector {
  return {
    name: "osm_overpass",
    mode: "local",
    async *run(ctx: RunContext) {
      const query = buildOverpassQuery(categories, ctx.config.bbox);
      for (const candidate of parseOverpassResponse(await fetchOverpass(query))) {
        yield candidate;
      }
    },
  };
}
