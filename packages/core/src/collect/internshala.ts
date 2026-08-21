import * as cheerio from "cheerio";
import type { RawCandidate } from "../core/types.js";
import type { Collector, RunContext } from "./types.js";
import { fetchWithBackoff } from "../core/http.js";

const BASE = "https://internshala.com/internships";

export function buildInternshalaUrl(category: string, city: string | null): string {
  const slug = `${category}-internship`;
  return city ? `${BASE}/${slug}-in-${city}` : `${BASE}/${slug}`;
}

/**
 * Internshala lists the hiring company but not its website, so identity falls
 * back to a normalised company name. The `internshala:` prefix keeps it from
 * ever colliding with a domain- or place-keyed company from another source —
 * at the cost that the same company found via two sources will not merge.
 * Name-based merging is deliberately not attempted; it is how dedupe goes wrong.
 */
function nameIdentity(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `internshala:${slug}`;
}

export function parseInternshalaPage(html: string): RawCandidate[] {
  const $ = cheerio.load(html);
  const out: RawCandidate[] = [];

  $(".individual_internship").each((_, el) => {
    const node = $(el);
    const name = node.find(".company-name").first().text().trim();
    if (!name) return;

    const titleEl = node.find("#job_title, .job-title-href").first();
    const title = titleEl.text().trim() || null;
    const href = titleEl.attr("href") ?? node.attr("data-href") ?? null;
    const location = node.find(".locations a").first().text().trim() || null;
    const activelyHiring = node.find(".actively-hiring-badge").length > 0;

    out.push({
      mode: "startup",
      identityKey: nameIdentity(name),
      name,
      website: null,
      city: location,
      category: null,
      source: "internshala",
      sourceUrl: href ? new URL(href, "https://internshala.com").toString() : null,
      signals: [
        { kind: "has_open_role", value: true },
        { kind: "open_role_title", value: title },
        { kind: "actively_hiring", value: activelyHiring },
        { kind: "has_website", value: false },
      ],
      contacts: [],
    });
  });

  return out;
}

export function createInternshalaCollector(
  categories: string[],
  city: string | null,
): Collector {
  return {
    name: "internshala",
    mode: "startup",
    async *run(ctx: RunContext) {
      for (const category of categories) {
        const url = buildInternshalaUrl(category, city);
        const res = await fetchWithBackoff(url, {
          headers: { "User-Agent": ctx.config.userAgent },
        });
        if (!res.ok) {
          throw new Error(`internshala ${res.status} for ${url}`);
        }
        for (const candidate of parseInternshalaPage(await res.text())) {
          yield candidate;
        }
      }
    },
  };
}
