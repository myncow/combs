import { revalidatePath } from "next/cache";
import type { MapBriefInput } from "@/lib/schema";
import { appConfig } from "@/lib/config";
import type { GenerationMetrics } from "@/lib/generation-metrics";
import { GenerationMetricsCollector } from "@/lib/generation-metrics";
import { withMetricsGenerationSink } from "@/lib/generation-sink-metrics";
import type { GenerationStreamSink } from "@/lib/generation-stream";
import { buildMapJob } from "@/lib/map-engine";
import { logGenerationRun, saveMap } from "@/lib/store";
import type { MapBrief, NormalizedMapBrief, MapDocument, GenerationJobResult } from "@/lib/types";

export type MapGenerationRunOutcome =
  | {
      outcome: "rejected";
      normalizedBrief: NormalizedMapBrief;
      metrics: GenerationMetrics;
    }
  | {
      outcome: "failed_publish";
      result: GenerationJobResult;
      normalizedBrief: NormalizedMapBrief;
      document: MapDocument | null;
      metrics: GenerationMetrics;
    }
  | {
      outcome: "success";
      normalizedBrief: NormalizedMapBrief;
      document: MapDocument;
      slug: string;
      title: string;
      mapId: string;
      metrics: GenerationMetrics;
    }
  | {
      outcome: "error";
      message: string;
      metrics: GenerationMetrics | null;
    };

function revalidateMapPaths(slug: string) {
  revalidatePath("/");
  revalidatePath("/gallery");
  revalidatePath(`/maps/${slug}`);
}

/**
 * Shared map generation: `buildMapJob`, metrics, persistence, and revalidation.
 * Callers own parse, moderation, and rate limiting.
 */
export async function runMapGenerationCore(
  briefInput: MapBriefInput,
  options?: { sink?: GenerationStreamSink },
): Promise<MapGenerationRunOutcome> {
  const collector = new GenerationMetricsCollector();

  try {
    const mergedSink = withMetricsGenerationSink(options?.sink, collector);
    const { result, normalizedBrief, document } = await buildMapJob(briefInput, mergedSink, collector);

    const metricsBase = collector.finalize();
    const inputBrief = briefInput as MapBrief;

    if (!normalizedBrief) {
      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        status: "failed",
        model: appConfig.openRouter.model,
        fallbackModel: appConfig.openRouter.fallbackModel,
        inputBrief,
        normalizedBrief: null,
        error: "Brief normalization unavailable.",
        metrics: metricsBase,
        createdAt: new Date().toISOString(),
      });
      return { outcome: "error", message: "Brief normalization unavailable.", metrics: metricsBase };
    }

    if (result.status === "rejected") {
      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        status: "rejected",
        model: appConfig.openRouter.model,
        fallbackModel: appConfig.openRouter.fallbackModel,
        inputBrief,
        normalizedBrief,
        metrics: metricsBase,
        createdAt: new Date().toISOString(),
      });

      return { outcome: "rejected", normalizedBrief, metrics: metricsBase };
    }

    if (result.status !== "success" || !document) {
      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        status: "failed",
        model: appConfig.openRouter.model,
        fallbackModel: appConfig.openRouter.fallbackModel,
        inputBrief,
        normalizedBrief,
        error: result.error,
        metrics: metricsBase,
        createdAt: new Date().toISOString(),
      });

      return {
        outcome: "failed_publish",
        result,
        normalizedBrief,
        document: document ?? null,
        metrics: metricsBase,
      };
    }

    const saved = await saveMap({
      brief: inputBrief,
      normalizedBrief,
      document,
      status: "published",
      metrics: metricsBase,
    });

    revalidateMapPaths(saved.slug);

    return {
      outcome: "success",
      normalizedBrief,
      document,
      slug: saved.slug,
      title: saved.title,
      mapId: saved.id,
      metrics: metricsBase,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    const metrics = collector.stages.length ? collector.finalize() : null;
    await logGenerationRun({
      id: `run_${crypto.randomUUID()}`,
      status: "failed",
      model: appConfig.openRouter.model,
      fallbackModel: appConfig.openRouter.fallbackModel,
      inputBrief: briefInput as MapBrief,
      normalizedBrief: null,
      error: message,
      metrics: metrics ?? null,
      createdAt: new Date().toISOString(),
    });
    return { outcome: "error", message, metrics };
  }
}
