import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBsmPage, BSM_SOURCE_URL } from "../../src/collect/bsm.js";

const html = readFileSync(join(import.meta.dirname, "../fixtures/bsm.html"), "utf8");

describe("parseBsmPage", () => {
  it("reassembles a flight payload split across several script tags", () => {
    // The real page ships one 840KB chunk, but Next is free to split the
    // stream at any byte. A parser that only reads the largest script would
    // pass against today's page and silently return nothing after a rebuild.
    expect(parseBsmPage(html)).toHaveLength(4);
  });

  it("keys identity on the slug, never the name", () => {
    const klubb = parseBsmPage(html).find((c) => c.name === "Klubb")!;
    expect(klubb.identityKey).toBe("bsm:klubb");
    expect(klubb.sourceUrl).toBe(`${BSM_SOURCE_URL}/company/klubb`);
    expect(klubb.mode).toBe("startup");
  });

  it("carries the fields the scorer and the graph need", () => {
    const klubb = parseBsmPage(html).find((c) => c.name === "Klubb")!;
    const kinds = Object.fromEntries(klubb.signals.map((s) => [s.kind, s.value]));
    expect(kinds).toMatchObject({
      stage: "Series A",
      sector: "Fintech",
      team_size: "51-200",
      total_funding: "$20M",
      status: "Active",
      founded_year: 2019,
      has_open_role: true,
      investors: ["Peak XV Surge", "Trifecta Capital"],
    });
    expect(klubb.lat).toBeCloseTo(12.9352);
    expect(klubb.website).toBe("https://klubb.example");
  });

  it("records a missing website as a gap signal rather than dropping the row", () => {
    const velo = parseBsmPage(html).find((c) => c.name === "Velocitee")!;
    expect(velo.website).toBeNull();
    expect(velo.signals).toContainEqual({ kind: "has_website", value: false });
    expect(velo.signals).toContainEqual({ kind: "has_open_role", value: false });
  });

  it("keeps closed companies — pay capacity sinks them, no special case needed", () => {
    const gone = parseBsmPage(html).find((c) => c.name === "Gonecorp")!;
    const status = gone.signals.find((s) => s.kind === "status");
    expect(status?.value).toBe("Closed");
  });

  it("marks funds as vc so they can become graph hubs", () => {
    const vc = parseBsmPage(html).find((c) => c.name === "Threeone4")!;
    expect(vc.category).toBe("vc");
    expect(vc.signals).toContainEqual({ kind: "fund_size", value: "~Rs 1,550 cr AUM" });
  });

  it("turns linkedin and founder links into contacts", () => {
    const klubb = parseBsmPage(html).find((c) => c.name === "Klubb")!;
    expect(klubb.contacts).toContainEqual({
      type: "linkedin", value: "https://linkedin.com/company/klubb",
    });
    expect(klubb.contacts).toContainEqual({
      type: "founder_linkedin", value: "https://linkedin.com/in/afounder",
    });
  });

  it("throws on a page with no flight payload rather than returning nothing", () => {
    // Silently returning [] would look like "the site has no startups today",
    // which is indistinguishable from success and would quietly empty the tab.
    expect(() => parseBsmPage("<html><body>nope</body></html>")).toThrow(/payload/i);
  });
});

describe("parseBsmPage — quirks of the live dataset", () => {
  it('accepts founded_year as "" — 107 of 957 live records ship it that way', () => {
    // Found only by running the parser against the real page; a hand-written
    // fixture agrees with whatever the author assumed.
    const page = (year: string) =>
      buildPage([{ name: "X", slug: "x", founded_year: year } as never]);
    const [c] = parseBsmPage(page(""));
    expect(c!.signals.find((s) => s.kind === "founded_year")).toBeUndefined();
  });

  it("coerces a numeric string year to a number", () => {
    const [c] = parseBsmPage(buildPage([{ name: "X", slug: "x", founded_year: "2019" } as never]));
    expect(c!.signals.find((s) => s.kind === "founded_year")?.value).toBe(2019);
  });
});

/** Builds a page in the same flight-stream wrapper the real site emits. */
function buildPage(records: unknown[]): string {
  const flight = `4:${JSON.stringify(["$", "$Lc", null, { startups: records }])}\n`;
  return `<html><body><script>self.__next_f.push(${JSON.stringify([1, flight])})</script></body></html>`;
}
