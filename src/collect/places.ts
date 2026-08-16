import { z } from "zod";
import { placeIdentity } from "../core/identity.js";
import type { RawCandidate } from "../core/types.js";
import type { Collector, RunContext } from "./types.js";

/**
 * Locked field mask. `places.rating` puts requests on the Enterprise SKU
 * (1,000 free calls/month, then ~$35/1,000). Any review-text field raises
 * that to $40/1,000 for data gigpull does not use. Do not add fields
 * without checking the tier they land in — tests/collect/places.test.ts
 * asserts no review-text field is present.
 */
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.primaryType",
].join(",");

const PlaceSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }),
  formattedAddress: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  websiteUri: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  primaryType: z.string().optional(),
});

const ResponseSchema = z.object({ places: z.array(PlaceSchema).default([]) });

export function parsePlacesResponse(json: unknown): RawCandidate[] {
  const parsed = ResponseSchema.parse(json);
  return parsed.places.map((p) => ({
    mode: "local" as const,
    identityKey: placeIdentity(p.id),
    name: p.displayName.text,
    website: p.websiteUri ?? null,
    city: p.formattedAddress ?? null,
    category: p.primaryType ?? null,
    source: "google_places",
    sourceUrl: null,
    signals: [
      { kind: "rating", value: p.rating ?? null },
      { kind: "review_count", value: p.userRatingCount ?? 0 },
      { kind: "has_website", value: Boolean(p.websiteUri) },
    ],
    contacts: p.nationalPhoneNumber
      ? [{ type: "phone", value: p.nationalPhoneNumber }]
      : [],
  }));
}

export function createPlacesCollector(categories: string[]): Collector {
  return {
    name: "google_places",
    mode: "local",
    async *run(ctx: RunContext) {
      const key = ctx.config.googlePlacesApiKey;
      if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set");

      for (const category of categories) {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery: `${category} in ${ctx.config.city}`,
            pageSize: 20,
          }),
        });
        if (!res.ok) {
          throw new Error(`Places API ${res.status}: ${await res.text()}`);
        }
        for (const candidate of parsePlacesResponse(await res.json())) {
          yield candidate;
        }
      }
    },
  };
}
