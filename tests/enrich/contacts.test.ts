import { describe, it, expect } from "vitest";
import { extractContacts } from "../../src/enrich/contacts.js";

const html = `
<html><body>
  <a href="mailto:owner@anand.example">Email us</a>
  <a href="tel:+919845012345">Call</a>
  <a href="https://instagram.com/example.business">IG</a>
  <a href="https://www.linkedin.com/company/example-business/">LinkedIn</a>
  <a href="https://twitter.com/examplebusiness">X</a>
  <a href="mailto:owner@anand.example">Duplicate</a>
</body></html>`;

describe("extractContacts", () => {
  it("extracts an email from a mailto link", () => {
    expect(extractContacts(html, "https://anand.example"))
      .toContainEqual({ type: "email", value: "owner@anand.example" });
  });

  it("extracts a phone from a tel link", () => {
    expect(extractContacts(html, "https://anand.example"))
      .toContainEqual({ type: "phone", value: "+919845012345" });
  });

  it("records social handles without fetching the platform", () => {
    const out = extractContacts(html, "https://anand.example");
    expect(out).toContainEqual({ type: "instagram", value: "example.business" });
    expect(out).toContainEqual({ type: "linkedin", value: "example-business" });
    expect(out).toContainEqual({ type: "x", value: "examplebusiness" });
  });

  it("de-duplicates repeated contacts", () => {
    const emails = extractContacts(html, "https://anand.example")
      .filter((c) => c.type === "email");
    expect(emails).toHaveLength(1);
  });

  it("returns an empty list for html with no contacts", () => {
    expect(extractContacts("<html><body><p>hi</p></body></html>", "https://x.example"))
      .toEqual([]);
  });
});
