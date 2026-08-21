import { describe, it, expect, vi } from "vitest";
import { REGIONS, resolveRegions, METRO_GROUP } from "../../src/core/regions.js";

const noNetwork = async () => { throw new Error("should not have hit the network"); };

describe("REGIONS presets", () => {
  it("covers Bangalore, the metros, and the requested MP towns", () => {
    for (const name of ["bangalore", "delhi", "mumbai", "jabalpur", "sihora"]) {
      expect(REGIONS[name], name).toBeDefined();
    }
  });

  it("stores every preset as south,west,north,east with south below north", () => {
    for (const [name, bbox] of Object.entries(REGIONS)) {
      const [s, w, n, e] = bbox.split(",").map(Number);
      expect(Number.isFinite(s) && Number.isFinite(w), name).toBe(true);
      expect(n!, name).toBeGreaterThan(s!);
      expect(e!, name).toBeGreaterThan(w!);
    }
  });

  it("resolves Sihora to the Jabalpur district one, not the Damoh namesake", () => {
    // Name search returns Sihora in Damoh; PIN 483225 is the Jabalpur one.
    const [s, w, n, e] = REGIONS.sihora!.split(",").map(Number);
    expect(s!).toBeGreaterThan(23.4);
    expect(n!).toBeLessThan(23.6);
    expect(w!).toBeGreaterThan(80.0);
    expect(e!).toBeLessThan(80.2);
  });
});

describe("resolveRegions", () => {
  it("resolves a preset without touching the network", async () => {
    const out = await resolveRegions("bangalore", noNetwork);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("bangalore");
    expect(out[0]!.bbox).toBe(REGIONS.bangalore);
  });

  it("resolves several comma-separated regions", async () => {
    const out = await resolveRegions("jabalpur,sihora", noNetwork);
    expect(out.map((r) => r.name)).toEqual(["jabalpur", "sihora"]);
  });

  it("expands the metros group", async () => {
    const out = await resolveRegions("metros", noNetwork);
    expect(out.length).toBe(METRO_GROUP.length);
    expect(out.map((r) => r.name)).toContain("mumbai");
  });

  it("geocodes an unknown place through the supplied lookup", async () => {
    const lookup = vi.fn(async () => "11.0,76.9,11.1,77.0");
    const out = await resolveRegions("kochi", lookup);
    expect(lookup).toHaveBeenCalledWith("kochi");
    expect(out[0]!.bbox).toBe("11.0,76.9,11.1,77.0");
  });

  it("accepts a raw bbox passed straight through", async () => {
    const out = await resolveRegions("12.9,77.5,13.0,77.7", noNetwork);
    expect(out[0]!.bbox).toBe("12.9,77.5,13.0,77.7");
  });

  it("names the place when geocoding finds nothing, rather than querying the planet", async () => {
    await expect(resolveRegions("nowhereville", async () => null))
      .rejects.toThrow(/nowhereville/);
  });
});
