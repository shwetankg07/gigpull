import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseInternshalaPage,
  buildInternshalaUrl,
} from "../../src/collect/internshala.js";

const html = readFileSync("tests/fixtures/internshala.html", "utf8");

describe("buildInternshalaUrl", () => {
  it("builds a category listing url", () => {
    expect(buildInternshalaUrl("computer-science", null))
      .toBe("https://internshala.com/internships/computer-science-internship");
  });

  it("scopes to a city when one is given", () => {
    expect(buildInternshalaUrl("computer-science", "bangalore"))
      .toBe("https://internshala.com/internships/computer-science-internship-in-bangalore");
  });
});

describe("parseInternshalaPage", () => {
  it("extracts every listing on the page", () => {
    expect(parseInternshalaPage(html)).toHaveLength(3);
  });

  it("reads the company name as the lead, not the job title", () => {
    const out = parseInternshalaPage(html);
    expect(out[0]!.name).toBe("Meru Technosoft Private Limited");
    expect(out[1]!.name).toBe("AppVersal");
  });

  it("marks candidates as startup mode with an open role", () => {
    const out = parseInternshalaPage(html);
    expect(out[0]!.mode).toBe("startup");
    expect(out[0]!.signals.find((s) => s.kind === "has_open_role")!.value).toBe(true);
  });

  it("records the role title and a link back to the listing", () => {
    const out = parseInternshalaPage(html);
    expect(out[0]!.signals.find((s) => s.kind === "open_role_title")!.value)
      .toBe("QA Automation Testing");
    expect(out[0]!.sourceUrl).toContain("internshala.com/internship/detail/");
  });

  it("builds an identity key from the company name when no domain is known", () => {
    // Internshala does not expose company websites, so identity falls back to a
    // normalised name. Prefixed distinctly so it can never collide with a
    // domain- or place-keyed company from another source.
    const out = parseInternshalaPage(html);
    expect(out[0]!.identityKey).toBe("internshala:meru-technosoft-private-limited");
    expect(out[1]!.identityKey).toBe("internshala:appversal");
  });

  it("returns an empty list rather than throwing on a page with no listings", () => {
    expect(parseInternshalaPage("<html><body><p>nothing</p></body></html>")).toEqual([]);
  });
});
