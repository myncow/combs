import type { GenerationMetricsCollector } from "@/lib/generation-metrics";
import type { GenerationStreamSink } from "@/lib/generation-stream";

/** Forward trace events while recording token/stream usage fragments into collector. */
export function withMetricsGenerationSink(
  inner: GenerationStreamSink | undefined,
  collector: GenerationMetricsCollector | undefined,
): GenerationStreamSink | undefined {
  if (!collector && !inner) {
    return undefined;
  }

  return (event) => {
    if (collector && event.type === "usage") {
      collector.addStreamUsageEvent({
        step: event.step,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        totalTokens: event.totalTokens,
        reasoningTokens: event.reasoningTokens,
      });
    }
    inner?.(event);
  };
}
