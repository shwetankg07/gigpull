export interface Point {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la = toRad(a.lat);
  const lb = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Reads anchor points from config: "lat,lon;lat,lon".
 *
 * Anchors are the places the operator can already plausibly be on a weekday —
 * home, a campus, a partner's college. They are personal information, so they
 * live in gitignored config and never in the repository, and the tool works
 * without them.
 */
export function parseAnchors(raw: string | undefined | null): Point[] {
  if (!raw || !raw.trim()) return [];

  return raw.split(";").map((part) => {
    const [lat, lon] = part.split(",").map((n) => Number(n.trim()));
    if (part.split(",").length !== 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`invalid anchor "${part.trim()}" — expected lat,lon`);
    }
    return { lat: lat!, lon: lon! };
  });
}

/**
 * Distance to whichever anchor is nearest, or null when it cannot be known.
 *
 * Null rather than Infinity: 365 of 957 companies have no coordinates, and
 * treating "unmapped" as "far away" would quietly penalise them for a gap in
 * someone else's data.
 */
export function nearestAnchorKm(point: Point | null, anchors: Point[]): number | null {
  if (!point || anchors.length === 0) return null;
  return Math.min(...anchors.map((a) => haversineKm(point, a)));
}
