/**
 * Named search areas.
 *
 * There is deliberately no "all of India" region. Overpass is a free
 * volunteer-run service with hard memory and time limits; asking it for every
 * restaurant, salon and clinic between Kerala and Kashmir would time out, and
 * would be abusive even if it did not. It would also produce a list far larger
 * than anyone can actually work. Searching city by city is both kinder to the
 * service and more useful — you can only call so many people.
 *
 * Bounding boxes are `south,west,north,east`, matching Overpass. Presets were
 * resolved once via Nominatim and baked in so common runs need no network call.
 */
export const REGIONS: Record<string, string> = {
  // Karnataka
  bangalore: "12.8334905,77.4598797,13.1426196,77.7840639",
  bengaluru: "12.8334905,77.4598797,13.1426196,77.7840639",

  // Metros
  delhi: "28.4046285,76.8388351,28.8834464,77.3453379",
  mumbai: "18.8949990,72.7092035,19.2149990,73.0292035",
  hyderabad: "17.2916377,78.2387067,17.5608321,78.6223912",
  chennai: "12.8519771,80.1401875,13.2351580,80.3328982",
  pune: "18.3613738,73.6945071,18.6813738,74.0145071",
  kolkata: "22.4520292,88.2336280,22.6188255,88.4610776",
  ahmedabad: "22.8615374,72.4200568,23.1815374,72.7400568",

  // NCR satellites — dense with small startups and agencies
  gurugram: "28.2005681,76.6510198,28.5409048,77.2418683",
  noida: "28.4006672,77.2928863,28.6354703,77.5065172",
  jaipur: "26.7554576,75.6589817,27.0754576,75.9789817",

  // Madhya Pradesh. Both resolved by PIN rather than by name: searching
  // "Sihora" by name returns a namesake in Damoh district, not the Jabalpur
  // one. 482002 = Jabalpur, 483225 = Sihora (Sihora Tahsil, Jabalpur).
  jabalpur: "23.1312065,79.8394116,23.2215219,79.9370991",
  sihora: "23.4449869,80.0566886,23.5353047,80.1546123",
};

/** Expanded by the `metros` shorthand. */
export const METRO_GROUP = [
  "bangalore", "delhi", "mumbai", "hyderabad",
  "chennai", "pune", "kolkata", "ahmedabad",
];

export interface ResolvedRegion {
  name: string;
  bbox: string;
}

/** A raw `south,west,north,east` string rather than a place name. */
function isRawBbox(spec: string): boolean {
  const parts = spec.split(",");
  return parts.length === 4 && parts.every((p) => Number.isFinite(Number(p.trim())));
}

export type GeocodeFn = (place: string) => Promise<string | null>;

/**
 * Resolves a comma-separated spec into bounding boxes.
 *
 * Accepts preset names, the `metros` group, a raw bbox, or any other place
 * name — which is geocoded through `geocode`. Unknown places throw by name
 * rather than silently falling back to a default area, because a silent
 * fallback would quietly search the wrong city.
 */
export async function resolveRegions(
  spec: string,
  geocode: GeocodeFn,
): Promise<ResolvedRegion[]> {
  if (isRawBbox(spec)) return [{ name: "custom", bbox: spec.trim() }];

  const requested = spec
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const expanded = requested.flatMap((r) => (r === "metros" ? METRO_GROUP : [r]));

  const out: ResolvedRegion[] = [];
  const seen = new Set<string>();

  for (const name of expanded) {
    if (seen.has(name)) continue;
    seen.add(name);

    const preset = REGIONS[name];
    if (preset) {
      out.push({ name, bbox: preset });
      continue;
    }

    const geocoded = await geocode(name);
    if (!geocoded) {
      throw new Error(
        `could not resolve region "${name}" — pass a known region, a PIN code, ` +
          `or a raw bbox as south,west,north,east`,
      );
    }
    out.push({ name, bbox: geocoded });
  }

  return out;
}
