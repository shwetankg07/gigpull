import { describe, it, expect, vi, afterEach } from "vitest";
import { createGeminiClient, parseGeminiResponse } from "../../src/llm/gemini.js";
import { loadConfig } from "../../src/config.js";

afterEach(() => { vi.unstubAllGlobals(); });

const cfg = loadConfig({ GEMINI_API_KEY: "test-key" } as NodeJS.ProcessEnv);

function geminiBody(payload: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] };
}

describe("parseGeminiResponse", () => {
  it("pulls the JSON out of the first candidate's text part", () => {
    expect(parseGeminiResponse(geminiBody({ verdict: "keep" })))
      .toEqual({ verdict: "keep" });
  });

  it("throws when the response has no candidates", () => {
    expect(() => parseGeminiResponse({ candidates: [] })).toThrow(/no candidate/i);
  });

  it("throws when the model returns text that is not JSON", () => {
    expect(() => parseGeminiResponse({
      candidates: [{ content: { parts: [{ text: "I cannot help with that" }] } }],
    })).toThrow();
  });
});

describe("createGeminiClient", () => {
  it("throws when no api key is configured", () => {
    expect(() => createGeminiClient(loadConfig({} as NodeJS.ProcessEnv)))
      .toThrow(/GEMINI_API_KEY/);
  });

  it("sends the prompt and a Gemini-shaped schema, and returns parsed json", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(geminiBody({ verdict: "drop", reason: "gov", adjustment: 0 })),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const client = createGeminiClient(cfg);
    const out = await client.complete("is this a real business?", {
      type: "object",
      properties: { verdict: { type: "string" } },
      additionalProperties: false,
    });

    expect(out).toEqual({ verdict: "drop", reason: "gov", adjustment: 0 });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.contents[0].parts[0].text).toContain("is this a real business?");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).not.toHaveProperty("additionalProperties");
  });

  it("does not put the api key in the url", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify(geminiBody({ ok: true })), { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await createGeminiClient(cfg).complete("hi", { type: "object", properties: {} });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("test-key");
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "test-key" });
  });

  it("throws a readable error when Gemini returns a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad request", { status: 400 })));
    await expect(
      createGeminiClient(cfg).complete("hi", { type: "object", properties: {} }),
    ).rejects.toThrow(/400/);
  });

  it("retries a 429 rather than failing the lead outright", async () => {
    // Free tiers rate-limit hard; a single 429 must not cost a rerank.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify(geminiBody({ verdict: "keep" })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createGeminiClient(cfg, { backoff: { attempts: 2, sleep: async () => {} } });
    expect(await client.complete("hi", { type: "object", properties: {} }))
      .toEqual({ verdict: "keep" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
