"use server";

import { revalidatePath } from "next/cache";
import { materializeCellImageAsset } from "@/lib/cell-visualization-storage";
import { generateCellVisualizationWithMetrics } from "@/lib/cell-image";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import { runMapGenerationCore } from "@/lib/map-generation-runner";
import { mapBriefSchema, cellVisualizationResultSchema, type CellVisualizationResult } from "@/lib/schema";
import type { MapDocument, MapCell } from "@/lib/types";
import { patchMapCellVisualization } from "@/lib/store";

export type CreateMapActionState =
  | { status: "idle" }
  | { status: "success"; slug: string }
  | { status: "error"; message: string }
  | { status: "rejected"; guidance: string[] };

export async function createMapAction(
  _previousState: CreateMapActionState,
  formData: FormData,
): Promise<CreateMapActionState> {
  const requesterId = await getRequesterId();
  const rateLimit = checkRateLimit(requesterId);
  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: "You have reached the current generation limit. Please try again shortly.",
    };
  }

  const rawBrief = {
    topic: String(formData.get("topic") ?? "").slice(0, 120),
    extraContext: String(formData.get("extraContext") ?? "").slice(0, 500) || undefined,
  };

  const moderated = moderateText(`${rawBrief.topic} ${rawBrief.extraContext ?? ""}`);
  if (!moderated.safe) {
    return {
      status: "error",
      message: moderated.reason ?? "This prompt is blocked by moderation.",
    };
  }

  const parsed = mapBriefSchema.safeParse(rawBrief);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please review the brief and try again.",
    };
  }

  try {
    const outcome = await runMapGenerationCore(parsed.data);

    if (outcome.outcome === "rejected") {
      return {
        status: "rejected",
        guidance: outcome.normalizedBrief.guidance ?? ["Try a narrower topic with clearer dimensions."],
      };
    }

    if (outcome.outcome === "failed_publish") {
      return {
        status: "error",
        message:
          outcome.result.error ?? "Generation failed. Please tighten the topic and try again.",
      };
    }

    if (outcome.outcome === "error") {
      return {
        status: "error",
        message: outcome.message,
      };
    }

    return {
      status: "success",
      slug: outcome.slug,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong during generation.",
    };
  }
}

export type VisualizeCellActionState =
  | { status: "idle" }
  | { status: "success"; result: CellVisualizationResult }
  | { status: "error"; message: string };

export async function visualizeCellAction(
  _previousState: VisualizeCellActionState,
  formData: FormData,
): Promise<VisualizeCellActionState> {
  const requesterId = await getRequesterId();
  const rateLimit = checkRateLimit(requesterId);
  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: "You have reached the current generation limit. Please try again shortly.",
    };
  }

  const documentJson = formData.get("document");
  const cellJson = formData.get("cell");

  if (!documentJson || !cellJson) {
    return { status: "error", message: "Missing document or cell data." };
  }

  try {
    const document = JSON.parse(String(documentJson)) as MapDocument;
    const cell = JSON.parse(String(cellJson)) as MapCell;
    if (!["gap", "tension", "impossible"].includes(cell.status)) {
      return {
        status: "error",
        message: "This cell uses reference-led browsing rather than generated frontier visuals.",
      };
    }
    const moderationSource = `${document.title} ${document.domain} ${cell.label} ${cell.explanation}`;
    const moderated = moderateText(moderationSource);
    if (!moderated.safe) {
      return {
        status: "error",
        message: moderated.reason ?? "This prompt is blocked by moderation.",
      };
    }

    const { result: raw, metrics: vizMetrics } = await generateCellVisualizationWithMetrics(document, cell);
    if (!raw) {
      return {
        status: "error",
        message: "No idea image came back from the model. Check OPENROUTER_API_KEY and model availability.",
      };
    }

    const parsed = cellVisualizationResultSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", message: "Unexpected response shape from the model." };
    }

    const slug = document.slug;
    const matT0 = Date.now();
    const storedUrl = await materializeCellImageAsset(slug, cell.id, parsed.data.imageUrl);
    vizMetrics.materializationFetchMs = Date.now() - matT0;

    const updatedAt = new Date().toISOString();
    await patchMapCellVisualization(slug, cell.id, {
      imageUrl: storedUrl,
      caption: parsed.data.caption,
      updatedAt,
    });
    revalidatePath(`/maps/${slug}`);
    revalidatePath("/gallery");

    return {
      status: "success",
      result: { imageUrl: storedUrl, caption: parsed.data.caption },
    };
  } catch (error) {
    console.error("Cell idea image error:", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not generate an idea. Please try again.",
    };
  }
}
