import type { MapDocument } from "@/lib/types";

/** Server → client trace events (SSE). Kept JSON-serializable for the wire. */
export type GenerationTraceEvent =
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
  | { type: "research"; phase: "start" | "end"; focus?: string; sourcesFound?: number }
  | { type: "error"; step?: string; message: string }
  | { type: "complete"; slug: string; title: string }
  /** Live-mode incremental updates: full document snapshot at a given revision. */
  | { type: "snapshot"; revision: number; status: "generating" | "published" | "failed"; document: MapDocument; phase?: string }
  | { type: "failed"; message: string };

export type GenerationStreamSink = (event: GenerationTraceEvent) => void;

export function formatSseData(event: GenerationTraceEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function emitStep(sink: GenerationStreamSink | undefined, step: string, phase: "start" | "end", detail?: string) {
  sink?.({ type: "step", step, phase, detail });
}
