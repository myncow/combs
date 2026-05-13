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
import { buildMapJob, enrichPublishedMap, type MapEngineModels } from "@/lib/map-engine";
import { resolveRequestedChatModel } from "@/lib/chat-model-options";
import { MAP_TOPIC, publish as publishBusEvent, type MapEvent } from "@/lib/server-event-bus";
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
    /** Neon Auth user id of the owner, written on inserts via saveMap. */
    ownerId?: string | null;
    /**
     * Fired once the map row is flipped to "published" — before the SerpApi
     * enrichment phase (anchor verification, gap verification, reference
     * images) runs. Lets the SSE caller emit a `complete` event and close the
     * stream so the user navigates immediately. Enrichment continues in the
     * same async task and writes incremental patches to the live row.
     */
    onPublished?: (info: { slug: string; title: string; mapId: string }) => void;
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
    // Extract validated model overrides from the brief (already parsed by the schema).
    const briefModels = (briefInput as { models?: { mapModel?: string; researchModel?: string; suggestModel?: string } | undefined }).models;
    const engineModels: MapEngineModels | undefined = briefModels
      ? {
          mapModel: resolveRequestedChatModel(briefModels.mapModel, appConfig.openRouter.model),
          researchModel: resolveRequestedChatModel(briefModels.researchModel, appConfig.openRouter.researchModel),
          suggestModel: resolveRequestedChatModel(briefModels.suggestModel, appConfig.openRouter.suggestModel),
        }
      : undefined;
    const { result, normalizedBrief, document } = await buildMapJob(briefInput, mergedSink, collector, {
      mapId: reserved?.id,
      models: engineModels,
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
    let publishedDocument = document;

    if (reserved) {
      // Map row was reserved up front; flip to published with the LLM-derived
      // document. SerpApi enrichment runs after this publish moment so the
      // user sees the grid before reference-image lookups complete.
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
    } else {
      const saved = await saveMap({
        brief: inputBrief,
        normalizedBrief,
        document,
        status: "published",
        metrics: metricsBase,
        ownerId: options?.ownerId ?? null,
      });
      savedSlug = saved.slug;
      savedTitle = saved.title;
      savedId = saved.id;
    }

    revalidateMapPaths(savedSlug);

    // Caller (e.g. SSE route) can close its stream here so the client
    // navigates immediately. Enrichment runs in the same async task below.
    options?.onPublished?.({ slug: savedSlug, title: savedTitle, mapId: savedId });

    try {
      publishedDocument = await enrichPublishedMap(document, normalizedBrief, {
        mapId: reserved ? reserved.id : undefined,
        sink: options?.sink,
        collector,
      });
    } catch (error) {
      // Enrichment is best-effort — already-published map stays published.
      console.error(
        `[runMapGenerationCore] enrichment for ${savedSlug} failed:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      // Fire the terminal `complete` bus event the moment ALL enrichment
      // (anchor verification, gap probes, SerpAPI reference images) is
      // finished — success OR failure. The map page listens for this so
      // the per-cell "Searching examples…" placeholders stay up until
      // the global SerpAPI pass is genuinely done, instead of timing out
      // on a fixed window that may end too early on slow runs.
      publishBusEvent<MapEvent>(MAP_TOPIC(savedSlug), {
        kind: "complete",
        slug: savedSlug,
      });
    }

    const metricsFinal = collector.finalize();

    if (reserved) {
      // Reserved path: runner owns the generation_runs row. Write it AFTER
      // enrichment so the row reflects total wall time including SerpApi work.
      // (Legacy non-reserved path: saveMap() writes the row internally with
      // pre-enrichment metrics; enrichment metrics are dropped on the floor
      // there to keep saveMap's contract simple.)
      await logGenerationRun({
        id: `run_${crypto.randomUUID()}`,
        mapId: savedId,
        status: "success",
        model: appConfig.openRouter.model,
        fallbackModel: appConfig.openRouter.fallbackModel,
        normalizedBrief,
        inputBrief,
        metrics: metricsFinal,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      outcome: "success",
      normalizedBrief,
      document: publishedDocument,
      slug: savedSlug,
      title: savedTitle,
      mapId: savedId,
      metrics: metricsFinal,
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
