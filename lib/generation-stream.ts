import type { MapCellVisualization, MapDocument } from "@/lib/types";

/**
 * Wire contract for the per-map and per-list SSE streams.
 *
 * Routes that emit these:
 *  - `app/api/maps/[slug]/events/route.ts` — per-map stream consumed by
 *    `LiveMapShell`.
 *  - `app/api/maps/events/route.ts`        — global maps stream consumed
 *    by `ExplorerSidebar` (different shape, see that route).
 *
 * Anything not in this union should NOT be sent over the wire. Internal
 * pipeline trace events (token usage, reasoning deltas, research progress)
 * live in `GenerationSinkEvent` below and are intentionally kept off the
 * wire — they are only consumed by the metrics collector.
 */
export type GenerationTraceEvent =
  | { type: "error"; step?: string; message: string }
  | { type: "complete"; slug: string; title: string }
  /** Initial hydrate: full document at a known revision. */
  | {
      type: "snapshot";
      revision: number;
      status: "generating" | "published" | "failed";
      document: MapDocument;
      phase?: string;
    }
  /** Per-cell image landed; clients merge this in without re-rendering the grid. */
  | {
      type: "cell_visualization";
      revision: number;
      cellId: string;
      visualization: MapCellVisualization;
    }
  /** Status flip (generating -> published/failed) without a full document re-emit. */
  | { type: "status_change"; revision: number; status: "generating" | "published" | "failed" }
  | { type: "failed"; message: string };

/**
 * Sink-only events. Emitted internally by the generation pipeline and
 * captured by `withMetricsGenerationSink` for collector metrics. Never
 * forwarded to clients.
 */
export type GenerationSinkOnlyEvent =
  | { type: "step"; step: string; phase: "start" | "end"; detail?: string }
  | { type: "reasoning_delta"; step: string; text: string }
  | { type: "output_delta"; step: string; text: string }
  | {
      type: "usage";
      step: string;
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      reasoningTokens?: number;
    }
  | { type: "research"; phase: "start" | "end"; focus?: string; sourcesFound?: number };

export type GenerationSinkEvent = GenerationTraceEvent | GenerationSinkOnlyEvent;

export type GenerationStreamSink = (event: GenerationSinkEvent) => void;

export function formatSseData(event: GenerationTraceEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function emitStep(
  sink: GenerationStreamSink | undefined,
  step: string,
  phase: "start" | "end",
  detail?: string,
) {
  sink?.({ type: "step", step, phase, detail });
}
