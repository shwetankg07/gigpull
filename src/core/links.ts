/**
 * Links for eyeballing a lead before contacting it.
 *
 * The point is judgement before outreach: seeing the storefront, the photos and
 * the review count tells you in ten seconds whether a place is worth a call —
 * far more reliably than a row in a database. All three links are built from
 * data already collected, so none of this needs an API key or a billing account.
 */

export interface LinkInput {
  name: string;
  lat: number | null;
  lon: number | null;
  sourceUrl: string | null;
  website: string | null;
}

export interface Links {
  /** Google Maps — photos, hours, reviews, and the Google Business Profile. */
  maps: string | null;
  /** Street View at the coordinates, to look at the actual premises. */
  streetView: string | null;
  /** Wherever the lead was discovered, e.g. its OpenStreetMap node. */
  source: string | null;
  website: string | null;
}

export function buildLinks(input: LinkInput): Links {
  const name = input.name.trim();
  const hasCoords = input.lat !== null && input.lon !== null;

  // Google's documented Maps URL format. Including coordinates alongside the
  // name disambiguates chains and common names to the right branch.
  const query = hasCoords ? `${name} ${input.lat},${input.lon}` : name;

  const maps = name
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${input.lat},${input.lon}`
      : null;

  const streetView = hasCoords
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${input.lat},${input.lon}`
    : null;

  return { maps, streetView, source: input.sourceUrl, website: input.website };
}
