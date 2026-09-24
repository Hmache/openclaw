import { describe, expect, it } from "vitest";
import { normalizeOllamaToolSchema } from "./tool-schema.runtime.js";

describe("normalizeOllamaToolSchema", () => {
  it("keeps free-form object schemas without injecting empty properties", () => {
    const normalized = normalizeOllamaToolSchema(
      { type: "object", additionalProperties: true },
      true,
    );

    expect(normalized).toEqual({ type: "object", additionalProperties: true });
  });

  it("still adds empty properties for closed object schemas with no properties", () => {
    const normalized = normalizeOllamaToolSchema({ type: "object" }, true);

    expect(normalized).toEqual({ type: "object", properties: {} });
  });

  it("still adds empty properties when additionalProperties is explicitly false", () => {
    const normalized = normalizeOllamaToolSchema(
      { type: "object", additionalProperties: false },
      true,
    );

    expect(normalized).toEqual({ type: "object", additionalProperties: false, properties: {} });
  });

  it("normalizes declared properties recursively", () => {
    const normalized = normalizeOllamaToolSchema({
      type: "object",
      properties: {
        query: { anyOf: [{ type: "string" }, { type: "null" }] },
        tags: { items: { type: "string" } },
      },
      required: ["query"],
    });

    expect(normalized.type).toBe("object");
    expect((normalized.properties as Record<string, { type?: string }>).query.type).toBe("string");
    expect((normalized.properties as Record<string, { type?: string }>).tags.type).toBe("array");
  });
});
