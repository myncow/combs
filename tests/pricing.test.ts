import { describe, expect, it } from "vitest";
import {
  cellVisualizationCost,
  formatUsd,
  perImageCost,
  SERPAPI_COST_PER_CALL,
  stageTokenCost,
  totalLlmCost,
} from "@/lib/pricing";
import type { GenerationStageMetric } from "@/lib/generation-metrics";

describe("stageTokenCost", () => {
  it("computes cost for a known model", () => {
    const stage: GenerationStageMetric = {
      stageId: "test",
      durationMs: 0,
      model: "google/gemini-3.1-flash-lite-preview",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    };
    // 1M prompt at $0.10 + 1M completion at $0.40 = $0.50
    expect(stageTokenCost(stage)).toBeCloseTo(0.5, 6);
  });

  it("falls back to default price for unknown model", () => {
    const stage: GenerationStageMetric = {
      stageId: "test",
      durationMs: 0,
      model: "some/unknown-model",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    };
    // default $0.15 + $0.60 = $0.75
    expect(stageTokenCost(stage)).toBeCloseTo(0.75, 6);
  });

  it("returns 0 when no token data", () => {
    const stage: GenerationStageMetric = { stageId: "x", durationMs: 0 };
    expect(stageTokenCost(stage)).toBe(0);
  });
});

describe("totalLlmCost", () => {
  it("sums costs across all stages", () => {
    const stages: GenerationStageMetric[] = [
      { stageId: "a", durationMs: 0, model: "openai/gpt-4.1-nano", promptTokens: 1_000_000, completionTokens: 0 },
      { stageId: "b", durationMs: 0, model: "openai/gpt-4.1-nano", promptTokens: 0, completionTokens: 1_000_000 },
    ];
    // 1M prompt at $0.10 = $0.10, 1M completion at $0.40 = $0.40 → $0.50
    expect(totalLlmCost(stages)).toBeCloseTo(0.5, 6);
  });
});

describe("perImageCost", () => {
  it("returns flat price for known per-image models", () => {
    expect(perImageCost("bytedance-seed/seedream-4.5")).toBe(0.04);
    expect(perImageCost("black-forest-labs/flux.2-max")).toBe(0.07);
  });

  it("returns null for token-billed models", () => {
    expect(perImageCost("google/gemini-3.1-flash-image-preview")).toBeNull();
    expect(perImageCost("openai/gpt-5.4-image-2")).toBeNull();
  });
});

describe("cellVisualizationCost", () => {
  it("uses flat per-image rate when available", () => {
    const cost = cellVisualizationCost({
      imageModel: "bytedance-seed/seedream-4.5",
      imageGenerationCalls: 2,
    });
    expect(cost).toBeCloseTo(0.08, 6);
  });

  it("uses token pricing for token-billed models", () => {
    const cost = cellVisualizationCost({
      imageModel: "google/gemini-3.1-flash-image-preview",
      imageGenerationCalls: 1,
      promptTokens: 1_000_000,
      completionTokens: 0,
    });
    // $0.50 per M prompt
    expect(cost).toBeCloseTo(0.5, 6);
  });
});

describe("SERPAPI_COST_PER_CALL", () => {
  it("is $0.0025", () => {
    expect(SERPAPI_COST_PER_CALL).toBe(0.0025);
  });
});

describe("formatUsd", () => {
  it("formats zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("formats fractional amounts below $0.01", () => {
    expect(formatUsd(0.001)).toBe("$0.00100");
  });

  it("formats regular amounts with 4 decimal places", () => {
    expect(formatUsd(0.15)).toBe("$0.1500");
  });
});
