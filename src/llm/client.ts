import Anthropic from "@anthropic-ai/sdk";
import type { GigpullConfig } from "../config.js";

export interface LlmClient {
  complete(prompt: string, schema: object): Promise<unknown>;
}

export function createAnthropicClient(
  cfg: GigpullConfig,
  opts: { model?: string; effort?: "low" | "medium" | "high" } = {},
): LlmClient {
  if (!cfg.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey });
  const model = opts.model ?? "claude-opus-5";
  const effort = opts.effort ?? "low";

  return {
    async complete(prompt: string, schema: object): Promise<unknown> {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        output_config: { effort, format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      } as Anthropic.MessageCreateParamsNonStreaming);

      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") throw new Error("no text block in response");
      return JSON.parse(text.text);
    },
  };
}
