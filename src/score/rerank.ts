import { z } from "zod";
import type { LlmClient } from "../llm/client.js";

export interface RerankInput {
  name: string;
  category: string | null;
  city: string | null;
  reviewCount: number;
  hasWebsite: boolean;
  defects: string[];
  signals: Record<string, unknown>;
}

export interface RerankVerdict {
  verdict: "keep" | "drop";
  reason: string;
  adjustment: number;
}

const VerdictSchema = z.object({
  verdict: z.enum(["keep", "drop"]),
  reason: z.string().min(1),
  adjustment: z.number(),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["keep", "drop"] },
    reason: { type: "string" },
    adjustment: { type: "number" },
  },
  required: ["verdict", "reason", "adjustment"],
  additionalProperties: false,
} as const;

const NEUTRAL = (reason: string): RerankVerdict => ({
  verdict: "keep", reason, adjustment: 0,
});

function buildPrompt(input: RerankInput): string {
  return [
    "You are screening a shortlist of businesses for freelance software outreach.",
    "Decide whether this organisation is worth a cold approach.",
    "",
    "Drop it if it is not a commercial prospect that could buy software work:",
    "government offices, temples and places of worship, public hospitals,",
    "outlets of a national chain whose technology is decided centrally,",
    "or a listing that is clearly not a real operating business.",
    "",
    "Otherwise keep it. Give an adjustment between -20 and +20 reflecting how",
    "much better or worse this looks than its numbers alone suggest.",
    "",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

export async function rerank(
  input: RerankInput,
  llm: LlmClient,
): Promise<RerankVerdict> {
  let raw: unknown;
  try {
    raw = await llm.complete(buildPrompt(input), JSON_SCHEMA);
  } catch (e) {
    return NEUTRAL(`rerank unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  const parsed = VerdictSchema.safeParse(raw);
  if (!parsed.success) return NEUTRAL("rerank unavailable: malformed response");

  return {
    verdict: parsed.data.verdict,
    reason: parsed.data.reason,
    adjustment: Math.max(-20, Math.min(20, parsed.data.adjustment)),
  };
}
