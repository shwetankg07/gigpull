import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PLACES_FIELD_MASK, parsePlacesResponse } from "../../src/collect/places.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/places-search.json", "utf8"));

describe("PLACES_FIELD_MASK", () => {
  it("requests rating and review count", () => {
    expect(PLACES_FIELD_MASK).toContain("places.rating");
    expect(PLACES_FIELD_MASK).toContain("places.userRatingCount");
  });

  it("never requests review text — that is the $40/1000 tier", () => {
    expect(PLACES_FIELD_MASK).not.toMatch(/reviews/i);
    expect(PLACES_FIELD_MASK).not.toMatch(/editorialSummary/i);
  });
});

describe("parsePlacesResponse", () => {
  it("maps places to candidates with place identity keys", () => {
    const out = parsePlacesResponse(fixture);
    expect(out).toHaveLength(2);
    expect(out[0]!.identityKey).toBe("place:ChIJanand");
    expect(out[0]!.name).toBe("Anand Sweets");
    expect(out[0]!.mode).toBe("local");
  });

  it("emits rating, review_count and has_website signals", () => {
    const out = parsePlacesResponse(fixture);
    const kinds = out[0]!.signals.map((s) => s.kind);
    expect(kinds).toContain("rating");
    expect(kinds).toContain("review_count");
    expect(kinds).toContain("has_website");
    const hasWebsite = out[0]!.signals.find((s) => s.kind === "has_website");
    expect(hasWebsite!.value).toBe(false);
  });

  it("records has_website true when a site exists", () => {
    const out = parsePlacesResponse(fixture);
    const koshys = out.find((c) => c.identityKey === "place:ChIJkoshys")!;
    expect(koshys.signals.find((s) => s.kind === "has_website")!.value).toBe(true);
    expect(koshys.website).toBe("https://www.koshys.in/menu");
  });

  it("records the phone number as a contact", () => {
    const out = parsePlacesResponse(fixture);
    expect(out[0]!.contacts).toContainEqual({ type: "phone", value: "098450 12345" });
  });

  it("throws a typed error when the shape changes", () => {
    expect(() => parsePlacesResponse({ places: [{ id: 123 }] })).toThrow();
  });
});
