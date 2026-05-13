import { describe, expect, it } from "vitest";
import {
  isAllowedChatModel,
  labelForChatModelId,
  resolveRequestedChatModel,
} from "@/lib/chat-model-options";

describe("isAllowedChatModel", () => {
  it("accepts curated model ids", () => {
    expect(isAllowedChatModel("google/gemini-3.1-flash-lite-preview")).toBe(true);
    expect(isAllowedChatModel("openai/gpt-4.1-mini")).toBe(true);
  });

  it("rejects unknown ids", () => {
    expect(isAllowedChatModel("arbitrary/model-v99")).toBe(false);
  });

  it("handles nullish input", () => {
    expect(isAllowedChatModel(null)).toBe(false);
    expect(isAllowedChatModel(undefined)).toBe(false);
    expect(isAllowedChatModel("")).toBe(false);
  });
});

describe("resolveRequestedChatModel", () => {
  const fallback = "google/gemini-3.1-flash-lite-preview";

  it("returns requested model when allowed", () => {
    expect(resolveRequestedChatModel("openai/gpt-4.1-nano", fallback)).toBe("openai/gpt-4.1-nano");
  });

  it("returns default when model is not in allowlist", () => {
    expect(resolveRequestedChatModel("bad/model", fallback)).toBe(fallback);
  });

  it("returns default for null/undefined", () => {
    expect(resolveRequestedChatModel(null, fallback)).toBe(fallback);
    expect(resolveRequestedChatModel(undefined, fallback)).toBe(fallback);
  });

  it("trims whitespace before resolving", () => {
    expect(resolveRequestedChatModel("  openai/gpt-4.1-mini  ", fallback)).toBe("openai/gpt-4.1-mini");
  });
});

describe("labelForChatModelId", () => {
  it("returns curated label for known id", () => {
    expect(labelForChatModelId("google/gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
  });

  it("falls back to model slug tail for unknown id", () => {
    expect(labelForChatModelId("some/custom-model")).toBe("custom-model");
  });
});
