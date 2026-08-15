import { z } from "zod";
import type { RawCandidate } from "../core/types.js";
import type { Collector, RunContext } from "./types.js";

export interface AdvertiserResult {
  activeAdCount: number;
}

const ResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    ad_delivery_start_time: z.string().optional(),
    page_name: z.string().optional(),
  })),
});

export function parseAdLibraryResponse(json: unknown): AdvertiserResult {
  const parsed = ResponseSchema.parse(json);
  return { activeAdCount: parsed.data.length };
}

export interface AdTarget {
  identityKey: string;
  name: string;
  pageId: string;
}

export function createMetaAdsCollector(targets: AdTarget[]): Collector {
  return {
    name: "meta_ad_library",
    mode: "local",
    async *run(ctx: RunContext): AsyncIterable<RawCandidate> {
      const token = ctx.config.metaAdLibraryToken;
      if (!token) throw new Error("META_AD_LIBRARY_TOKEN is not set");

      for (const target of targets) {
        const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
        url.searchParams.set("access_token", token);
        url.searchParams.set("search_page_ids", `[${target.pageId}]`);
        url.searchParams.set("ad_active_status", "ACTIVE");
        url.searchParams.set("ad_reached_countries", "['IN']");
        url.searchParams.set("fields", "id,ad_delivery_start_time,page_name");

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Meta Ad Library ${res.status}: ${await res.text()}`);
        }
        const { activeAdCount } = parseAdLibraryResponse(await res.json());

        yield {
          mode: "local",
          identityKey: target.identityKey,
          name: target.name,
          website: null,
          city: null,
          category: null,
          source: "meta_ad_library",
          sourceUrl: null,
          signals: [
            { kind: "runs_ads", value: activeAdCount > 0 },
            { kind: "active_ad_count", value: activeAdCount },
          ],
          contacts: [],
        };
      }
    },
  };
}
