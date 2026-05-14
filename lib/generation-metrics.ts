/** Internal-only generation telemetry aggregating timings, counts, tokens, retries. JSON-serializable for `generation_runs.metrics`. */

export type GenerationStageMetric = {
  stageId: string;
  durationMs: number;
  externalCallCount?: number;
  model?: string;
  retryCount?: number;
  fallbackUsed?: boolean;
  fallbackCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  extras?: Record<string, unknown>;
};

export interface GenerationMetrics {
  version: 1;
  wallTimeMsTotal?: number;
  stages: GenerationStageMetric[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface CellVisualizationMetrics {
  version: 1;
  wallTimeMsTotal?: number;
  imageGenerationCalls: number;
  reviewCalls: number;
  fallbackImageModelUsed: boolean;
  repairAttempts: number;
  directivesTriedPrimary: number;
  directivesTriedFallback: number;
  earlyAcceptStopped: boolean;
  materializationFetchMs?: number;
  materializationWriteMs?: number;
  /** Token usage reported by the image model (token-billed models only). */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  stages?: GenerationStageMetric[];
}

export function aggregateTokenUsage(metrics: GenerationMetrics["stages"]) {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let any = false;
  for (const s of metrics) {
    if (typeof s.promptTokens === "number") {
      promptTokens += s.promptTokens;
      any = true;
    }
    if (typeof s.completionTokens === "number") {
      completionTokens += s.completionTokens;
      any = true;
    }
    if (typeof s.totalTokens === "number") {
      totalTokens += s.totalTokens;
      any = true;
    }
  }
  return any ? { promptTokens, completionTokens, totalTokens } : undefined;
}

export function mergeStages(target: GenerationMetrics, extra: GenerationStageMetric[]) {
  const next = [...target.stages, ...extra];
  return finalizeGenerationMetrics({
    ...target,
    stages: next,
  });
}

export function finalizeGenerationMetrics(partial: Omit<GenerationMetrics, "tokenUsage"> & { stages: GenerationStageMetric[] }): GenerationMetrics {
  const tokenUsage = aggregateTokenUsage(partial.stages);
  const wallTimes = partial.stages.map((s) => s.durationMs).filter((n) => Number.isFinite(n));
  const wallTimeMsTotal = wallTimes.length ? wallTimes.reduce((a, b) => a + b, 0) : partial.wallTimeMsTotal;
  return {
    version: 1,
    wallTimeMsTotal,
    stages: partial.stages,
    ...(tokenUsage ? { tokenUsage } : {}),
  };
}

export class GenerationMetricsCollector {
  readonly stages: GenerationStageMetric[] = [];
  readonly startedAt = Date.now();
  /**
   * Set when SerpApi returns a hard error (429 quota exhausted, 403 auth
   * failure) — downstream stages should skip further SerpApi calls instead
   * of burning quota retrying. Surfaced in `metrics.stages[*].extras` via
   * `addSerpApiOutcome` so the cost breakdown shows the circuit opened.
   */
  serpApiCircuitOpen = false;

  noteSerpApiCircuit(reason: "quota_exceeded" | "auth_failed" | "rate_limited") {
    this.serpApiCircuitOpen = true;
    this.appendStage({
      stageId: "serpapi_circuit_open",
      durationMs: 0,
      extras: { reason },
    });
  }

  appendStage(metric: GenerationStageMetric) {
    this.stages.push(metric);
  }

  addStructuredCallMetrics(opts: {
    stageId: string;
    durationMs: number;
    model?: string;
    externalCallCount?: number;
    retryCount?: number;
    fallbackUsed?: boolean;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    extras?: Record<string, unknown>;
  }) {
    this.appendStage({
      stageId: opts.stageId,
      durationMs: opts.durationMs,
      model: opts.model,
      externalCallCount: opts.externalCallCount,
      retryCount: opts.retryCount,
      fallbackUsed: opts.fallbackUsed,
      promptTokens: opts.promptTokens,
      completionTokens: opts.completionTokens,
      totalTokens: opts.totalTokens,
      extras: opts.extras,
    });
  }

  addResearchAggregate(opts: {
    durationWallMs: number;
    perFocus: Array<{ focus: string; durationMs: number; sourceCount: number; ok: boolean }>;
    externalCalls: number;
  }) {
    this.appendStage({
      stageId: "research",
      durationMs: opts.durationWallMs,
      externalCallCount: opts.externalCalls,
      extras: { focuses: opts.perFocus },
    });
  }

  addCellsAggregate(opts: {
    durationWallMs: number;
    batchCount: number;
    retryTotal: number;
    fallbackSyntheticBatchCount: number;
    externalCalls: number;
    model?: string;
    extras?: Record<string, unknown>;
  }) {
    this.appendStage({
      stageId: "cells_batches",
      durationMs: opts.durationWallMs,
      externalCallCount: opts.externalCalls,
      retryCount: opts.retryTotal,
      model: opts.model,
      extras: {
        batchCount: opts.batchCount,
        fallbackSyntheticBatchCount: opts.fallbackSyntheticBatchCount,
        ...opts.extras,
      },
    });
  }

  addReferenceImages(opts: {
    durationWallMs: number;
    serpApiCalls: number;
    concurrencyMaxObserved?: number;
    memoHits?: number;
    extras?: Record<string, unknown>;
  }) {
    this.appendStage({
      stageId: "reference_images_enrichment",
      durationMs: opts.durationWallMs,
      externalCallCount: opts.serpApiCalls,
      extras: {
        concurrencyMaxObserved: opts.concurrencyMaxObserved,
        memoHits: opts.memoHits,
        ...opts.extras,
      },
    });
  }

  finalize(): GenerationMetrics {
    return finalizeGenerationMetrics({
      version: 1,
      stages: [...this.stages],
      wallTimeMsTotal: Date.now() - this.startedAt,
    });
  }

  chronometer(stageId: string, extras?: () => Record<string, unknown>): () => void {
    const t0 = Date.now();
    return () => {
      this.appendStage({
        stageId,
        durationMs: Date.now() - t0,
        extras: extras?.(),
      });
    };
  }

  /**
   * Merge usage tokens from streaming responses (may fire once per model attempt).
   */
  addStreamUsageEvent(opts: {
    step: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
  }) {
    const same = this.stages.find((s) => s.stageId === opts.step);
    if (same) {
      same.model = same.model ?? opts.model;
      if (typeof opts.promptTokens === "number") {
        same.promptTokens = (same.promptTokens ?? 0) + opts.promptTokens;
      }
      if (typeof opts.completionTokens === "number") {
        same.completionTokens = (same.completionTokens ?? 0) + opts.completionTokens;
      }
      if (typeof opts.totalTokens === "number") {
        same.totalTokens = (same.totalTokens ?? 0) + opts.totalTokens;
      }
      const extra = same.extras ?? {};
      if (typeof opts.reasoningTokens === "number") {
        extra.reasoningTokens = ((extra.reasoningTokens as number) ?? 0) + opts.reasoningTokens;
      }
      same.extras = Object.keys(extra).length ? extra : undefined;
      return;
    }
    this.appendStage({
      stageId: opts.step,
      durationMs: 0,
      model: opts.model,
      promptTokens: opts.promptTokens,
      completionTokens: opts.completionTokens,
      totalTokens: opts.totalTokens,
      extras:
        typeof opts.reasoningTokens === "number" ? { reasoningTokens: opts.reasoningTokens } : undefined,
    });
  }
}

export type GenerationMetricsJson = GenerationMetrics | null | undefined;
