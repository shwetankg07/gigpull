import { describe, it, expect } from "vitest";
import { buildLinks } from "../../src/core/links.js";

describe("buildLinks", () => {
  it("builds a maps link from name and coordinates", () => {
    const l = buildLinks({ name: "Gokul Vegetarian", lat: 12.9784, lon: 77.6408, sourceUrl: null, website: null });
    expect(l.maps).toContain("google.com/maps/search/");
    expect(l.maps).toContain(encodeURIComponent("Gokul Vegetarian"));
    expect(l.maps).toContain("12.9784");
    expect(l.maps).toContain("77.6408");
  });

  it("builds a street view link so a storefront can be eyeballed", () => {
    const l = buildLinks({ name: "X", lat: 12.9, lon: 77.6, sourceUrl: null, website: null });
    expect(l.streetView).toContain("map_action=pano");
    expect(l.streetView).toContain("12.9,77.6");
  });

  it("falls back to a name-only maps search when coordinates are missing", () => {
    const l = buildLinks({ name: "Chai Point Koramangala", lat: null, lon: null, sourceUrl: null, website: null });
    expect(l.maps).toContain(encodeURIComponent("Chai Point Koramangala"));
    expect(l.streetView).toBeNull();
  });

  it("passes the collector's own source url through", () => {
    const l = buildLinks({
      name: "X", lat: null, lon: null,
      sourceUrl: "https://www.openstreetmap.org/node/123", website: null,
    });
    expect(l.source).toBe("https://www.openstreetmap.org/node/123");
  });

  it("escapes characters that would break the query string", () => {
    const l = buildLinks({ name: "Burma Burma & Tea Room", lat: null, lon: null, sourceUrl: null, website: null });
    expect(l.maps).not.toContain(" ");
    expect(l.maps).toContain("%26");
  });

  it("returns null links rather than broken ones for an unnamed company", () => {
    expect(buildLinks({ name: "", lat: null, lon: null, sourceUrl: null, website: null }).maps).toBeNull();
  });
});
