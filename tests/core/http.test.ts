import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithBackoff, retryDelayMs } from "../../src/core/http.js";

afterEach(() => { vi.unstubAllGlobals(); });

describe("retryDelayMs", () => {
  it("grows exponentially with the attempt number", () => {
    expect(retryDelayMs(0, null, 100)).toBe(100);
    expect(retryDelayMs(1, null, 100)).toBe(200);
    expect(retryDelayMs(2, null, 100)).toBe(400);
  });

  it("honours a numeric Retry-After header over the backoff curve", () => {
    expect(retryDelayMs(0, "3", 100)).toBe(3000);
  });

  it("ignores an unparseable Retry-After", () => {
    expect(retryDelayMs(1, "sometime-soon", 100)).toBe(200);
  });

  it("caps the delay so a bad header cannot stall a run for hours", () => {
    expect(retryDelayMs(0, "99999", 100)).toBe(60_000);
    expect(retryDelayMs(20, null, 100)).toBe(60_000);
  });
});

describe("fetchWithBackoff", () => {
  it("returns immediately on success without sleeping", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithBackoff("https://x.example", {}, { sleep: async () => {} });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds on a later attempt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const slept: number[] = [];
    const res = await fetchWithBackoff("https://x.example", {}, {
      sleep: async (ms) => { slept.push(ms); }, baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
    expect(slept).toHaveLength(1);
  });

  it("retries 5xx as well, since those are usually transient", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithBackoff("https://x.example", {}, {
      sleep: async () => {}, baseDelayMs: 10,
    });
    expect(res.status).toBe(200);
  });

  it("does NOT retry a 404 — retrying a client error just wastes time", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithBackoff("https://x.example", {}, { sleep: async () => {} });
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget and returns the last response", async () => {
    const fetchMock = vi.fn(async () => new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithBackoff("https://x.example", {}, {
      sleep: async () => {}, attempts: 3, baseDelayMs: 10,
    });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
