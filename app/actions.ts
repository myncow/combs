"use server";

import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth/server";
import {
  DegenerateImageError,
  materializeCellImageAsset,
  type MaterializedCellImage,
} from "@/lib/cell-visualization-storage";
import { generateCellVisualizationWithMetrics } from "@/lib/cell-image";
import { getBlobReadWriteToken } from "@/lib/env";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import { runMapGenerationCore } from "@/lib/map-generation-runner";
import {
  cellVisualizationResultSchema,
  mapBriefSchema,
  publishGapSpotlightSchema,
  type CellVisualizationResult,
} from "@/lib/schema";
import type { MapDocument, MapCell } from "@/lib/types";
import { patchMapCellVisualization, publishGapSpotlight } from "@/lib/store";
import {
  buildDiversificationSuffix,
  findHashCollisionAgainstOthers,
} from "@/lib/visualization-diversity";

export type CreateMapActionState =
  | { status: "idle" }
  | { status: "success"; slug: string }
  | { status: "error"; message: string }
  | { status: "rejected"; guidance: string[] };

export async function createMapAction(
  _previousState: CreateMapActionState,
  formData: FormData,
): Promise<CreateMapActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return {
      status: "error",
      message: "Sign in to build maps.",
    };
  }

  const requesterId = session.user.id || (await getRequesterId());
  const rateLimit = checkRateLimit(requesterId);
  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: "You have reached the current generation limit. Please try again shortly.",
    };
  }

  const rawBrief = {
    topic: String(formData.get("topic") ?? "").slice(0, 120),
    extraContext: String(formData.get("extraContext") ?? "").slice(0, 1500) || undefined,
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
  | { status: "success"; result: CellVisualizationResult & { imageModel: string; prompt?: string } }
  | { status: "error"; message: string };

export async function visualizeCellAction(
  _previousState: VisualizeCellActionState,
  formData: FormData,
): Promise<VisualizeCellActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return {
      status: "error",
      message: "Sign in to generate images.",
    };
  }

  const requesterId = session.user.id || (await getRequesterId());
  const rateLimit = checkRateLimit(requesterId);
  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: "You have reached the current generation limit. Please try again shortly.",
    };
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return {
      status: "error",
      message:
        "Image generation is not configured: set OPENROUTER_API_KEY in the server environment to enable sketches.",
    };
  }
  if (!getBlobReadWriteToken()) {
    return {
      status: "error",
      message:
        "Generated image persistence is not configured: set BLOB_READ_WRITE_TOKEN in the server environment.",
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
    // Moderate every string that ends up interpolated into the sketch prompt
    // or surfaced in the UI. The cell's label/explanation are LLM-generated
    // (the brief was moderated, but cells weren't), and example names flow
    // verbatim into both the prompt's grounding cues and the drawer caption.
    const exampleStrings = (cell.examples ?? []).flatMap((example) => [
      example.name,
      example.brand,
      example.year,
      example.evidenceNote,
      example.description,
    ]);
    const moderationSource = [
      document.title,
      document.domain,
      cell.label,
      cell.explanation,
      ...exampleStrings,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");
    const moderated = moderateText(moderationSource);
    if (!moderated.safe) {
      return {
        status: "error",
        message: moderated.reason ?? "This prompt is blocked by moderation.",
      };
    }

    const rawImageModel = formData.get("imageModel");
    const imageModel =
      typeof rawImageModel === "string" && rawImageModel.trim() !== "" ? rawImageModel.trim() : undefined;

    const slug = document.slug;

    async function generateAndMaterialize(
      extraPromptSuffix: string,
    ): Promise<{
      materialized: MaterializedCellImage;
      caption?: string;
      usedImageModel: string;
      usedPrompt?: string;
    } | { error: VisualizeCellActionState }> {
      const { result: raw, imageModel: usedImageModel, prompt: usedPrompt } =
        await generateCellVisualizationWithMetrics(document, cell, {
          imageModel,
          extraPromptSuffix,
        });
      if (!raw) {
        return {
          error: {
            status: "error",
            message:
              "The image model returned no image. This usually clears on retry — if it persists, the configured model may be temporarily unavailable.",
          },
        };
      }

      const parsed = cellVisualizationResultSchema.safeParse(raw);
      if (!parsed.success) {
        return { error: { status: "error", message: "Unexpected response shape from the model." } };
      }

      try {
        const materialized = await materializeCellImageAsset(slug, cell.id, parsed.data.imageUrl);
        return {
          materialized,
          caption: parsed.data.caption,
          usedImageModel,
          usedPrompt,
        };
      } catch (error) {
        if (error instanceof DegenerateImageError) {
          return {
            error: {
              status: "error",
              message:
                "The image came back empty or corrupted. Try again — this is usually a transient model issue.",
            },
          };
        }
        throw error;
      }
    }

    let attempt = await generateAndMaterialize("");
    if ("error" in attempt) {
      return attempt.error;
    }

    // Cross-cell duplicate detection: if this cell's bytes match another
    // cell's persisted visualization, the model collapsed two distinct
    // coordinates onto one rendering. Retry once with a diversification
    // suffix; accept whatever comes back from the second pass even if it
    // still collides (better than blocking the user).
    const collidingCell = findHashCollisionAgainstOthers(document, cell.id, attempt.materialized.byteHash);
    if (collidingCell) {
      console.warn("[visualize_cell] hash_collision", {
        slug,
        cellId: cell.id,
        collidedWith: collidingCell.id,
        byteHash: attempt.materialized.byteHash,
      });
      const retryAttempt = await generateAndMaterialize(buildDiversificationSuffix(collidingCell));
      if (!("error" in retryAttempt)) {
        attempt = retryAttempt;
      }
    }

    const updatedAt = new Date().toISOString();
    await patchMapCellVisualization(slug, cell.id, {
      imageUrl: attempt.materialized.url,
      caption: attempt.caption,
      updatedAt,
      imageModel: attempt.usedImageModel,
      prompt: attempt.usedPrompt,
      provider: attempt.materialized.provider,
      storageKey: attempt.materialized.storageKey,
      mimeType: attempt.materialized.mimeType,
      byteSize: attempt.materialized.byteSize,
      byteHash: attempt.materialized.byteHash,
    });
    revalidatePath(`/maps/${slug}`);
    revalidatePath("/gallery");

    return {
      status: "success",
      result: {
        imageUrl: attempt.materialized.url,
        caption: attempt.caption,
        imageModel: attempt.usedImageModel,
        prompt: attempt.usedPrompt,
      },
    };
  } catch (error) {
    console.error("Cell idea image error:", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not generate an idea. Please try again.",
    };
  }
}

export type PublishGapSpotlightActionState =
  | { status: "idle" }
  | { status: "success"; slug: string }
  | { status: "error"; message: string };

export async function publishGapSpotlightAction(
  _previousState: PublishGapSpotlightActionState,
  formData: FormData,
): Promise<PublishGapSpotlightActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return {
      status: "error",
      message: "Sign in to publish to the top list.",
    };
  }

  const parsed = publishGapSpotlightSchema.safeParse({
    mapSlug: String(formData.get("mapSlug") ?? ""),
    cellId: String(formData.get("cellId") ?? ""),
    storyTitle: String(formData.get("storyTitle") ?? "").slice(0, 120),
    storySummary: String(formData.get("storySummary") ?? "").slice(0, 220),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please review the story details and try again.",
    };
  }

  const moderated = moderateText(`${parsed.data.storyTitle} ${parsed.data.storySummary}`);
  if (!moderated.safe) {
    return {
      status: "error",
      message: moderated.reason ?? "This publish request is blocked by moderation.",
    };
  }

  try {
    const entry = await publishGapSpotlight(parsed.data);
    revalidatePath("/leaderboard");
    revalidatePath(`/leaderboard/${entry.slug}`);
    revalidatePath("/gallery");
    revalidatePath("/api/leaderboard");

    return {
      status: "success",
      slug: entry.slug,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not publish this spotlight.",
    };
  }
}
