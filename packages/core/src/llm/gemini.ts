import type { GigpullConfig } from "../config.js";
import type { LlmClient } from "./client.js";
import { toGeminiSchema } from "./geminiSchema.js";
import { fetchWithBackoff, type BackoffOptions } from "../core/http.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function parseGeminiResponse(json: unknown): unknown {
  const body = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("gemini: no candidate text in response");
  }
  return JSON.parse(text);
}

export function createGeminiClient(
  cfg: GigpullConfig,
  opts: { model?: string; backoff?: BackoffOptions } = {},
): LlmClient {
  if (!cfg.geminiApiKey) throw new Error("GEMINI_API_KEY is not set");
  const key = cfg.geminiApiKey;
  const model = opts.model ?? cfg.geminiModel;
  const backoff = opts.backoff ?? { attempts: 4, baseDelayMs: 5_000 };

  return {
    async complete(prompt: string, schema: object): Promise<unknown> {
      // Free tiers rate-limit aggressively; 429 carries a Retry-After that
      // fetchWithBackoff honours.
      const res = await fetchWithBackoff(`${ENDPOINT}/${model}:generateContent`, {
        method: "POST",
        // The key goes in a header, not the query string — URLs end up in
        // logs, proxies, and error messages far more often than headers do.
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(schema as Record<string, unknown>),
          },
        }),
      }, backoff);

      if (!res.ok) {
        throw new Error(`gemini ${res.status}: ${await res.text()}`);
      }
      return parseGeminiResponse(await res.json());
    },
  };
}
