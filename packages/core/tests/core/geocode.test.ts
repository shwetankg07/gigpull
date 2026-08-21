import { describe, it, expect, vi, afterEach } from "vitest";
import { createGeocoder } from "../../src/core/geocode.js";

afterEach(() => { vi.unstubAllGlobals(); });

const body = (bb: string[]) => new Response(JSON.stringify([{ boundingbox: bb }]), { status: 200 });

describe("createGeocoder", () => {
  it("looks a six-digit PIN up as a postal code, not free text", async () => {
    const fetchMock = vi.fn(async () => body(["23.44", "23.53", "80.05", "80.15"]));
    vi.stubGlobal("fetch", fetchMock);

    await createGeocoder("gigpull-test")("483225");

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("postalcode=483225");
    expect(url).toContain("country=India");
    expect(url).not.toContain("q=483225");
  });

  it("looks a place name up as free text", async () => {
    const fetchMock = vi.fn(async () => body(["1", "2", "3", "4"]));
    vi.stubGlobal("fetch", fetchMock);
    await createGeocoder("gigpull-test")("Kochi");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("q=Kochi");
  });

  it("reorders Nominatim's S,N,W,E into Overpass's S,W,N,E", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => body(["23.44", "23.53", "80.05", "80.15"])));
    expect(await createGeocoder("t")("483225")).toBe("23.44,80.05,23.53,80.15");
  });

  it("sends a User-Agent, which Nominatim's policy requires", async () => {
    const fetchMock = vi.fn(async () => body(["1", "2", "3", "4"]));
    vi.stubGlobal("fetch", fetchMock);
    await createGeocoder("gigpull/0.1 (+https://example.com)")("Pune");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"])
      .toBe("gigpull/0.1 (+https://example.com)");
  });

  it("returns null for no match rather than a bogus bbox", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await createGeocoder("t")("nowhereville")).toBeNull();
  });

  it("returns null on an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    expect(await createGeocoder("t")("Pune")).toBeNull();
  });
});
