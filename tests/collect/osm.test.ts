import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseOverpassResponse,
  buildOverpassQuery,
  fetchOverpass,
  OSM_CATEGORY_FILTERS,
  OVERPASS_ENDPOINTS,
} from "../../src/collect/osm.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/overpass.json", "utf8"));

afterEach(() => { vi.unstubAllGlobals(); });

describe("fetchOverpass", () => {
  it("falls through to the next mirror when one returns 504", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 504 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchOverpass("[out:json];", "test-agent/1.0")).toEqual({ elements: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(OVERPASS_ENDPOINTS[0]);
    expect(String(fetchMock.mock.calls[1]![0])).toBe(OVERPASS_ENDPOINTS[1]);
  });

  it("falls through when a mirror throws outright", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchOverpass("[out:json];", "test-agent/1.0")).toEqual({ elements: [] });
  });

  it("sends the caller's user agent, so traffic is attributable to whoever runs it", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchOverpass("[out:json];", "someone-else/2.0 (+https://example.com)");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"])
      .toBe("someone-else/2.0 (+https://example.com)");
  });

  it("throws naming every mirror once all of them fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 504 })));
    await expect(fetchOverpass("[out:json];", "test-agent/1.0")).rejects.toThrow(/all overpass mirrors failed/);
  });
});

describe("buildOverpassQuery", () => {
  it("queries both nodes and ways inside the bbox", () => {
    const q = buildOverpassQuery(["restaurant"], "12.83,77.45,13.14,77.78");
    expect(q).toContain("node");
    expect(q).toContain("way");
    expect(q).toContain("12.83,77.45,13.14,77.78");
    expect(q).toContain("out center tags");
  });

  it("includes a filter for each requested category", () => {
    const q = buildOverpassQuery(["restaurant", "gym"], "1,2,3,4");
    expect(q).toContain(OSM_CATEGORY_FILTERS.restaurant);
    expect(q).toContain(OSM_CATEGORY_FILTERS.gym);
  });

  it("throws on an unknown category rather than querying all of OSM", () => {
    expect(() => buildOverpassQuery(["nonsense"], "1,2,3,4")).toThrow(/nonsense/);
  });
});

describe("parseOverpassResponse", () => {
  it("builds stable osm identity keys from type and id", () => {
    const out = parseOverpassResponse(fixture);
    expect(out.map((c) => c.identityKey)).toContain("osm:node/1234567");
    expect(out.map((c) => c.identityKey)).toContain("osm:way/7654321");
  });

  it("skips unnamed elements — they cannot be contacted", () => {
    const out = parseOverpassResponse(fixture);
    expect(out.map((c) => c.identityKey)).not.toContain("osm:node/9999999");
  });

  it("emits has_website false when no website tag is present", () => {
    const out = parseOverpassResponse(fixture);
    const anand = out.find((c) => c.identityKey === "osm:node/1234567")!;
    expect(anand.signals.find((s) => s.kind === "has_website")!.value).toBe(false);
    expect(anand.website).toBeNull();
  });

  it("reads both website and contact:website tags", () => {
    const out = parseOverpassResponse(fixture);
    const koshys = out.find((c) => c.identityKey === "osm:way/7654321")!;
    expect(koshys.signals.find((s) => s.kind === "has_website")!.value).toBe(true);
    expect(koshys.website).toBe("https://koshys.example");

    const gym = out.find((c) => c.identityKey === "osm:node/4444444")!;
    expect(gym.website).toBe("http://fitnessfirst.example");
  });

  it("extracts phone, email and social handles as contacts", () => {
    const out = parseOverpassResponse(fixture);
    const anand = out.find((c) => c.identityKey === "osm:node/1234567")!;
    expect(anand.contacts).toContainEqual({ type: "phone", value: "+91 98450 12345" });

    const koshys = out.find((c) => c.identityKey === "osm:way/7654321")!;
    expect(koshys.contacts).toContainEqual({ type: "email", value: "hello@koshys.example" });

    const gym = out.find((c) => c.identityKey === "osm:node/4444444")!;
    expect(gym.contacts).toContainEqual({
      type: "instagram", value: "fitnessfirst.blr",
    });
  });

  it("records the category and locality", () => {
    const out = parseOverpassResponse(fixture);
    const anand = out.find((c) => c.identityKey === "osm:node/1234567")!;
    expect(anand.category).toBe("confectionery");
    expect(anand.city).toBe("Indiranagar");
    expect(anand.mode).toBe("local");
  });

  it("throws when the response shape changes", () => {
    expect(() => parseOverpassResponse({ nodes: [] })).toThrow();
  });
});
