import { describe, it, expect } from "vitest";
import { haversineKm, parseAnchors, nearestAnchorKm } from "../../src/core/geo.js";

// Two Bangalore neighbourhoods, chosen only to give the distance maths a
// known span. Real anchors are personal and live in gitignored config.
const INDIRANAGAR = { lat: 12.9784, lon: 77.6408 };
const WHITEFIELD = { lat: 12.9698, lon: 77.7500 };

describe("haversineKm", () => {
  it("measures a known Bangalore span", () => {
    // Indiranagar to Whitefield is ~12km as the crow flies.
    const d = haversineKm(WHITEFIELD, INDIRANAGAR);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(14);
  });

  it("is zero for a point against itself and symmetric", () => {
    expect(haversineKm(INDIRANAGAR, INDIRANAGAR)).toBeCloseTo(0);
    expect(haversineKm(INDIRANAGAR, WHITEFIELD))
      .toBeCloseTo(haversineKm(WHITEFIELD, INDIRANAGAR));
  });
});

describe("parseAnchors", () => {
  it("reads several semicolon-separated points", () => {
    expect(parseAnchors("12.9784,77.6408;12.9698,77.7500")).toEqual([
      { lat: 12.9784, lon: 77.6408 }, { lat: 12.9698, lon: 77.75 },
    ]);
  });

  it("returns an empty list for blank config rather than throwing", () => {
    // Anchors are personal data and optional. Someone running their own copy
    // with no anchors set should get a working tool, minus the bonus.
    expect(parseAnchors(undefined)).toEqual([]);
    expect(parseAnchors("")).toEqual([]);
  });

  it("rejects malformed points loudly", () => {
    expect(() => parseAnchors("12.9784")).toThrow(/anchor/i);
    expect(() => parseAnchors("abc,def")).toThrow(/anchor/i);
  });
});

describe("nearestAnchorKm", () => {
  it("takes the closer of several anchors, not the first", () => {
    const anchors = [WHITEFIELD, INDIRANAGAR];
    // Domlur sits close to Indiranagar and far from Whitefield; taking the
    // first anchor rather than the nearest would report roughly 9km.
    const domlur = { lat: 12.9606, lon: 77.6386 };
    expect(nearestAnchorKm(domlur, anchors)!).toBeLessThan(3);
  });

  it("returns null when the company has no coordinates", () => {
    // 365 of 957 live records have none. They must not be treated as
    // infinitely far, which would be a silent penalty for missing data.
    expect(nearestAnchorKm(null, [INDIRANAGAR])).toBeNull();
    expect(nearestAnchorKm({ lat: 1, lon: 1 }, [])).toBeNull();
  });
});
