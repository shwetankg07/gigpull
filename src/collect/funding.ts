import * as cheerio from "cheerio";
import { z } from "zod";
import { domainIdentity } from "../core/identity.js";
import type { RawCandidate } from "../core/types.js";
import type { Collector, RunContext } from "./types.js";
import type { LlmClient } from "../llm/client.js";

export interface FeedItem {
  title: string;
  link: string;
  publishedAt: string;
}

export function parseFundingFeed(xml: string): FeedItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: FeedItem[] = [];
  $("item").each((_, el) => {
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link").first().text().trim();
    const publishedAt = $(el).find("pubDate").first().text().trim();
    if (title && link) items.push({ title, link, publishedAt });
  });
  if (items.length === 0) throw new Error("funding feed: no <item> elements found");
  return items;
}

const ExtractionSchema = z.object({
  company: z.string().min(1),
  website: z.string().nullable(),
  stage: z.string().nullable(),
  amountUsd: z.number().nullable(),
});

const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    company: { type: "string" },
    website: { type: ["string", "null"] },
    stage: { type: ["string", "null"] },
    amountUsd: { type: ["number", "null"] },
  },
  required: ["company", "website", "stage", "amountUsd"],
  additionalProperties: false,
} as const;

export interface FundingCollector extends Collector {
  runFromItems?(items: FeedItem[], ctx: RunContext): AsyncIterable<RawCandidate>;
}

export function createFundingCollector(
  feedUrls: string[],
  llm: LlmClient,
): FundingCollector {
  async function* fromItems(
    items: FeedItem[],
    _ctx: RunContext,
  ): AsyncIterable<RawCandidate> {
    for (const item of items) {
      let extracted: z.infer<typeof ExtractionSchema>;
      try {
        const raw = await llm.complete(
          `Extract the funded company from this headline. Return the company's own website URL if you can determine it, otherwise null.\n\n${item.title}\n${item.link}`,
          EXTRACTION_JSON_SCHEMA,
        );
        extracted = ExtractionSchema.parse(raw);
      } catch {
        continue;
      }

      if (!extracted.website) continue;
      const identityKey = domainIdentity(extracted.website);
      if (!identityKey) continue;

      yield {
        mode: "startup",
        identityKey,
        name: extracted.company,
        website: extracted.website,
        city: null,
        category: extracted.stage,
        source: "funding_news",
        sourceUrl: item.link,
        signals: [
          { kind: "funded_within_180d", value: true },
          { kind: "funding_stage", value: extracted.stage },
          { kind: "funding_amount_usd", value: extracted.amountUsd },
        ],
        contacts: [],
      };
    }
  }

  return {
    name: "funding_news",
    mode: "startup",
    runFromItems: fromItems,
    async *run(ctx: RunContext) {
      for (const url of feedUrls) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`funding feed ${url}: HTTP ${res.status}`);
        for await (const c of fromItems(parseFundingFeed(await res.text()), ctx)) {
          yield c;
        }
      }
    },
  };
}
