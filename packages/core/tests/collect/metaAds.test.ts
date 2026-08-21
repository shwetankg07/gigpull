import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseAdLibraryResponse } from "../../src/collect/metaAds.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/meta-ads.json", "utf8"));

describe("parseAdLibraryResponse", () => {
  it("counts active ads", () => {
    expect(parseAdLibraryResponse(fixture).activeAdCount).toBe(3);
  });

  it("returns zero for an advertiser with no active ads", () => {
    expect(parseAdLibraryResponse({ data: [] }).activeAdCount).toBe(0);
  });

  it("throws when the response shape changes", () => {
    expect(() => parseAdLibraryResponse({ results: [] })).toThrow();
  });
});
