import { describe, it, expect } from "vitest";
import { toGeminiSchema } from "../../src/llm/geminiSchema.js";

describe("toGeminiSchema", () => {
  it("strips additionalProperties, which Gemini rejects", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    });
    expect(out).not.toHaveProperty("additionalProperties");
    expect(out.type).toBe("object");
  });

  it("converts a nullable union type to Gemini's nullable flag", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { website: { type: ["string", "null"] } },
    }) as { properties: Record<string, { type: string; nullable: boolean }> };
    expect(out.properties.website!.type).toBe("string");
    expect(out.properties.website!.nullable).toBe(true);
  });

  it("leaves a plain type untouched and does not mark it nullable", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { company: { type: "string" } },
    }) as { properties: Record<string, { type: string; nullable?: boolean }> };
    expect(out.properties.company!.type).toBe("string");
    expect(out.properties.company!.nullable).toBeUndefined();
  });

  it("preserves enum and required", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: { verdict: { type: "string", enum: ["keep", "drop"] } },
      required: ["verdict"],
    }) as { required: string[]; properties: Record<string, { enum: string[] }> };
    expect(out.required).toEqual(["verdict"]);
    expect(out.properties.verdict!.enum).toEqual(["keep", "drop"]);
  });

  it("recurses into nested objects and array items", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: { x: { type: ["number", "null"] } },
          additionalProperties: false,
        },
        list: {
          type: "array",
          items: { type: "object", properties: {}, additionalProperties: false },
        },
      },
    }) as Record<string, any>;
    expect(out.properties.nested).not.toHaveProperty("additionalProperties");
    expect(out.properties.nested.properties.x.nullable).toBe(true);
    expect(out.properties.list.items).not.toHaveProperty("additionalProperties");
  });

  it("converts the real rerank schema without losing its shape", () => {
    const out = toGeminiSchema({
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["keep", "drop"] },
        reason: { type: "string" },
        adjustment: { type: "number" },
      },
      required: ["verdict", "reason", "adjustment"],
      additionalProperties: false,
    }) as Record<string, any>;
    expect(Object.keys(out.properties).sort()).toEqual(["adjustment", "reason", "verdict"]);
    expect(out).not.toHaveProperty("additionalProperties");
  });
});
