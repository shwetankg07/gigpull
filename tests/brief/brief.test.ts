import { describe, it, expect } from "vitest";
import { buildBrief } from "../../src/brief/brief.js";

const full = {
  name: "Anand Sweets", city: "Indiranagar", rating: 4.5, reviewCount: 892,
  hasWebsite: false, runsAds: true, defects: ["stale_copyright"],
  contacts: [
    { type: "phone", value: "+919845012345" },
    { type: "email", value: "owner@anand.example" },
  ],
  angle: "direct WhatsApp ordering, skip the aggregator cut",
};

describe("buildBrief", () => {
  it("puts name, rating and review count on the first line", () => {
    const md = buildBrief(full)!;
    expect(md.split("\n")[0]).toContain("Anand Sweets");
    expect(md.split("\n")[0]).toContain("4.5");
    expect(md.split("\n")[0]).toContain("892");
  });

  it("states the no-website gap explicitly", () => {
    expect(buildBrief(full)!).toMatch(/no website/i);
  });

  it("lists every contact", () => {
    const md = buildBrief(full)!;
    expect(md).toContain("+919845012345");
    expect(md).toContain("owner@anand.example");
  });

  it("includes the angle line", () => {
    expect(buildBrief(full)!).toMatch(/direct WhatsApp ordering/);
  });

  it("returns null when there are no concrete facts", () => {
    expect(buildBrief({
      name: "Nothing Co", city: null, rating: null, reviewCount: 0,
      hasWebsite: true, runsAds: false, defects: [], contacts: [], angle: null,
    })).toBeNull();
  });

  it("never invents a fact that was not supplied", () => {
    const md = buildBrief({ ...full, runsAds: false })!;
    expect(md).not.toMatch(/ads/i);
  });
});
