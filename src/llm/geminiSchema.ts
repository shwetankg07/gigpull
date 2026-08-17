/**
 * Gemini's `responseSchema` is an OpenAPI 3.0 subset, not full JSON Schema.
 * Two differences bite in practice:
 *
 *   - `additionalProperties` is rejected outright.
 *   - Nullable fields are `{ type: "string", nullable: true }`, not the
 *     JSON Schema union form `{ type: ["string", "null"] }`.
 *
 * gigpull's schemas are written in JSON Schema for the Anthropic client, so
 * this converts them on the way out rather than maintaining two copies.
 */

type JsonSchema = Record<string, unknown>;

function convertType(node: JsonSchema): JsonSchema {
  const type = node.type;
  if (!Array.isArray(type)) return node;

  const nonNull = type.filter((t) => t !== "null");
  const nullable = type.includes("null");
  const head = nonNull[0];

  return {
    ...node,
    type: typeof head === "string" ? head : "string",
    ...(nullable ? { nullable: true } : {}),
  };
}

export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const { additionalProperties: _dropped, ...rest } = convertType(schema);
  const out: JsonSchema = { ...rest };

  if (out.properties && typeof out.properties === "object") {
    const props = out.properties as Record<string, JsonSchema>;
    const converted: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(props)) {
      converted[key] = toGeminiSchema(value);
    }
    out.properties = converted;
  }

  if (out.items && typeof out.items === "object") {
    out.items = toGeminiSchema(out.items as JsonSchema);
  }

  return out;
}
