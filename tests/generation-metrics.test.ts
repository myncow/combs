import { describe, expect, it } from "vitest";
import {
  aggregateTokenUsage,
  finalizeGenerationMetrics,
  GenerationMetricsCollector,
  mergeStages,
} from "@/lib/generation-metrics";

describe("GenerationMetricsCollector", () => {
  it("accumulates staged metrics and summarizes tokens", () => {
    const c = new GenerationMetricsCollector();
    c.addStructuredCallMetrics({
      stageId: "a",
      durationMs: 10,
      model: "primary",
      externalCallCount: 1,
      promptTokens: 12,
      completionTokens: 3,
      totalTokens: 15,
    });
    c.addStructuredCallMetrics({
      stageId: "b",
      durationMs: 5,
      externalCallCount: 2,
      promptTokens: 5,
      completionTokens: 1,
      totalTokens: 6,
    });

    const m = c.finalize();
    expect(m.stages.length).toBeGreaterThanOrEqual(2);
    expect(m.tokenUsage?.promptTokens).toBe(17);
    expect(m.tokenUsage?.completionTokens).toBe(4);
    expect(m.tokenUsage?.totalTokens).toBe(21);
  });

  it("finalizeGenerationMetrics merges tokenUsage from stages", () => {
    const m = finalizeGenerationMetrics({
      version: 1,
      stages: [
        {
          stageId: "cells_batches",
          durationMs: 100,
          extras: { batchCount: 2 },
          promptTokens: 4,
          completionTokens: 2,
          totalTokens: 6,
        },
      ],
    });
    expect(aggregateTokenUsage(m.stages)?.totalTokens).toBe(6);
    expect(m.tokenUsage?.totalTokens).toBe(6);
  });

  it("mergeStages appends and re-finalizes aggregates", () => {
    const base = finalizeGenerationMetrics({
      version: 1,
      stages: [{ stageId: "s1", durationMs: 10, promptTokens: 2, completionTokens: 2, totalTokens: 4 }],
    });
    const merged = mergeStages(base, [{ stageId: "s2", durationMs: 3, completionTokens: 1, totalTokens: 8 }]);
    expect(merged.stages.length).toBe(2);
    expect(merged.tokenUsage?.completionTokens).toBe(3);
  });
});
