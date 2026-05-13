import { describe, expect, it } from "vitest";
import { mapBriefSchema } from "@/lib/schema";

describe("mapBriefSchema models block", () => {
  it("accepts a brief without models", () => {
    const result = mapBriefSchema.safeParse({ topic: "Mushrooms" });
    expect(result.success).toBe(true);
    expect(result.data?.models).toBeUndefined();
  });

  it("accepts allowed model overrides", () => {
    const result = mapBriefSchema.safeParse({
      topic: "Mushrooms",
      models: {
        mapModel: "openai/gpt-4.1-mini",
        researchModel: "google/gemini-2.5-flash",
        suggestModel: "openai/gpt-4.1-nano",
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.models?.mapModel).toBe("openai/gpt-4.1-mini");
  });

  it("rejects disallowed chat model ids", () => {
    const result = mapBriefSchema.safeParse({
      topic: "Mushrooms",
      models: { mapModel: "evil/model-injection" },
    });
    expect(result.success).toBe(false);
  });

  it("strips empty string model fields to undefined", () => {
    const result = mapBriefSchema.safeParse({
      topic: "Mushrooms",
      models: { mapModel: "" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.models?.mapModel).toBeUndefined();
  });
});
