import { describe, it, expect } from "vitest";
import { canonicalDomain, domainIdentity, placeIdentity } from "../../src/core/identity.js";

describe("canonicalDomain", () => {
  it("strips scheme, www, path, query and lowercases", () => {
    expect(canonicalDomain("https://WWW.Acme.com/pricing?utm=x")).toBe("acme.com");
    expect(canonicalDomain("http://acme.com")).toBe("acme.com");
    expect(canonicalDomain("acme.com")).toBe("acme.com");
  });

  it("keeps distinct subdomains distinct", () => {
    expect(canonicalDomain("https://blog.acme.com")).toBe("blog.acme.com");
  });

  it("returns null for junk", () => {
    expect(canonicalDomain("")).toBeNull();
    expect(canonicalDomain("not a url")).toBeNull();
    expect(canonicalDomain("mailto:a@b.com")).toBeNull();
  });
});

describe("identity keys", () => {
  it("builds a domain identity", () => {
    expect(domainIdentity("https://www.Acme.com/x")).toBe("domain:acme.com");
  });

  it("returns null when there is no usable domain", () => {
    expect(domainIdentity("garbage")).toBeNull();
  });

  it("builds a place identity", () => {
    expect(placeIdentity("ChIJabc")).toBe("place:ChIJabc");
  });

  it("never collapses two different companies by name", () => {
    expect(domainIdentity("https://acme.com")).not.toBe(domainIdentity("https://acme.io"));
  });
});
