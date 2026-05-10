import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { MapBriefInput } from "@/lib/schema";
import { appConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { mapsTable } from "@/lib/db/schema";
import type { GenerationMetrics } from "@/lib/generation-metrics";
import { GenerationMetricsCollector } from "@/lib/generation-metrics";
import { withMetricsGenerationSink } from "@/lib/generation-sink-metrics";
import type { GenerationStreamSink } from "@/lib/generation-stream";
import { buildFallbackMapDocument } from "@/lib/map-fallback-document";
import { buildMapJob } from "@/lib/map-engine";
import { applyMapPatch, logGenerationRun, saveMap } from "@/lib/store";
import type {
  GenerationJobResult,
  MapBrief,
  MapDocument,
  NormalizedMapBrief,
} from "@/lib/types";

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
 * Mark an already-reserved map row as failed so the live shell can render the
 * error state and the SSE poller can shut down.
 */
async function markReservedMapFailed(
  mapId: string,
  message: string,
  options?: {
    slug?: string;
    normalizedBrief?: NormalizedMapBrief | null;
    document?: MapDocument | null;
  },
) {
  const fallbackDocument =
    options?.document ??
    (options?.normalizedBrief
      ? buildFallbackMapDocument(options.normalizedBrief, { slug: options.slug })
      : null);

  if (fallbackDocument) {
    await applyMapPatch({
      mapId,
      mutate: (current) => ({
        ...fallbackDocument,
        slug: current.slug || fallbackDocument.slug,
      }),
      status: "failed",
    });
  }

  const db = getDb();
  await db
    .update(mapsTable)
    .set({
      status: "failed",
      summary: message.slice(0, 500),
    })
    .where(eq(mapsTable.id, mapId));
}

/**
 * Shared map generation: `buildMapJob`, metrics, persistence, and revalidation.
 * Callers own parse, moderation, and rate limiting.
 *
 * When `reservedMap` is provided, the map row already exists with status
 * "generating"; this runner mutates it in place and flips it to "published" or
 * "failed" at the end. Without `reservedMap`, the legacy behavior applies:
 * runner inserts a fresh "published" row at the end.
 */
export async function runMapGenerationCore(
  briefInput: MapBriefInput,
  options?: {
    sink?: GenerationStreamSink;
    reservedMap?: { id: string; slug: string };
  },
): Promise<MapGenerationRunOutcome> {
  const collector = new GenerationMetricsCollector();
  const reserved = options?.reservedMap ?? null;

  // Fail fast and unambiguously when generation is unconfigured. Without the
  // API key, `buildMapJob` would silently produce a `null` normalized brief
  // and surface as the generic "Brief normalization unavailable" message —
  // which leaves users (or operators) guessing whether the model failed,
  // the prompt was rejected, or env config is wrong.
  if (!process.env.OPENROUTER_API_KEY) {
    const message =
      "Map generation is not configured: set OPENROUTER_API_KEY in the server environment.";
    if (reserved) await markReservedMapFailed(reserved.id, message);
    return { outcome: "error", message, metrics: null };
  }

  try {
    const mergedSink = withMetricsGenerationSink(options?.sink, collector);
    const { result, normalizedBrief, document } = await buildMapJob(briefInput, mergedSink, collector, {
      mapId: reserved?.id,
    });

    const metricsBase = collector.finalize();
    const inputBrief = briefInput as MapBrief;

    if (!normalizedBrief) {
      const message =
        "Brief normalization came back empty. The model returned no structured brief — try a more specific topic, or check that OPENROUTER_API_KEY has access to the configured model.";
      if (reserved) await markReservedMapFailed(reserved.id, message);
      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        mapId: reserved?.id,
        status: "failed",
        model: appConfig.openRouter.model,
        fallbackModel: appConfig.openRouter.fallbackModel,
        inputBrief,
        normalizedBrief: null,
        error: message,
        metrics: metricsBase,
        createdAt: new Date().toISOString(),
      });
      return { outcome: "error", message, metrics: metricsBase };
    }

    if (result.status === "rejected") {
      const message = normalizedBrief.guidance?.join(" ") ?? "Brief was rejected.";
      if (reserved) {
        await markReservedMapFailed(reserved.id, message, {
          slug: reserved.slug,
          normalizedBrief,
        });
      }
      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        mapId: reserved?.id,
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
      // Prefer the engine's specific error (e.g. "Cell batch parse failed",
      // "Visual probe rejected the axis labels", "Coordinate mismatch in cell
      // A·03"). Fall back to a clear message that names the gate that failed
      // — `canAutoPublish` checks ≥9 cells, ≥1 notable gap or impossible
      // combo, ≥2 distinct examples per existing cell, ≥1 per rare cell.
      const message =
        result.error ??
        "The generated map didn't meet the publish gate (≥9 cells, at least one notable gap or impossible combo, and ≥2 distinct examples per existing cell). Try a more concrete topic.";
      if (reserved) {
        await markReservedMapFailed(reserved.id, message, {
          slug: reserved.slug,
          normalizedBrief,
          document,
        });
      }
      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        mapId: reserved?.id,
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

    let savedSlug: string;
    let savedTitle: string;
    let savedId: string;

    if (reserved) {
      // Map row was reserved up front; flip to published and finalize document.
      const stamped = { ...document, slug: reserved.slug };
      const patched = await applyMapPatch({
        mapId: reserved.id,
        mutate: () => stamped,
        status: "published",
        publishedAtIso: new Date().toISOString(),
      });
      if (!patched) {
        const message = "Reserved map row disappeared before publish.";
        await logGenerationRun({
          id: `run_${crypto.randomUUID()}`,
          mapId: reserved.id,
          status: "failed",
          model: appConfig.openRouter.model,
          fallbackModel: appConfig.openRouter.fallbackModel,
          inputBrief,
          normalizedBrief,
          error: message,
          metrics: metricsBase,
          createdAt: new Date().toISOString(),
        });
        return { outcome: "error", message, metrics: metricsBase };
      }
      savedSlug = reserved.slug;
      savedTitle = stamped.title;
      savedId = reserved.id;

      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        mapId: savedId,
        status: "success",
        model: appConfig.openRouter.model,
        fallbackModel: appConfig.openRouter.fallbackModel,
        normalizedBrief,
        inputBrief,
        metrics: metricsBase,
        createdAt: new Date().toISOString(),
      });
    } else {
      const saved = await saveMap({
        brief: inputBrief,
        normalizedBrief,
        document,
        status: "published",
        metrics: metricsBase,
      });
      savedSlug = saved.slug;
      savedTitle = saved.title;
      savedId = saved.id;
    }

    revalidateMapPaths(savedSlug);

    return {
      outcome: "success",
      normalizedBrief,
      document,
      slug: savedSlug,
      title: savedTitle,
      mapId: savedId,
      metrics: metricsBase,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    if (reserved) await markReservedMapFailed(reserved.id, message);
    const metrics = collector.stages.length ? collector.finalize() : null;
    await logGenerationRun({
      id: `run_${crypto.randomUUID()}`,
      mapId: reserved?.id,
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
