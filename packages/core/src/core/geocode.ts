import { fetchWithBackoff } from "./http.js";
import type { GeocodeFn } from "./regions.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** A six-digit Indian PIN code. */
const PIN_RE = /^\d{6}$/;

/**
 * Resolves a place name or PIN code to a bounding box via Nominatim.
 *
 * PIN codes are looked up as postal codes rather than free text, because name
 * search is ambiguous in exactly the way that matters here: searching "Sihora"
 * returns a namesake in Damoh district, while 483225 unambiguously gives the
 * Jabalpur one.
 *
 * Nominatim asks for at most one request per second and a real User-Agent.
 * gigpull only geocodes regions it has no preset for — at most a handful per
 * run — so no throttle beyond the natural sequencing is needed.
 */
export function createGeocoder(userAgent: string): GeocodeFn {
  return async (place: string): Promise<string | null> => {
    const params = new URLSearchParams({ format: "json", limit: "1" });

    if (PIN_RE.test(place)) {
      params.set("postalcode", place);
      params.set("country", "India");
    } else {
      params.set("q", place);
    }

    const res = await fetchWithBackoff(`${NOMINATIM}?${params}`, {
      headers: { "User-Agent": userAgent },
    }, { attempts: 2, baseDelayMs: 1_500 });

    if (!res.ok) return null;

    const body = (await res.json()) as Array<{ boundingbox?: string[] }>;
    const bb = body[0]?.boundingbox;
    // Nominatim returns [south, north, west, east]; Overpass wants S,W,N,E.
    if (!bb || bb.length !== 4) return null;
    return `${bb[0]},${bb[2]},${bb[1]},${bb[3]}`;
  };
}
