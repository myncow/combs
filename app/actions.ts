"use server";

import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/auth/admin";
import { viewerCanMutateMap } from "@/lib/auth/permissions";
import { getAuth } from "@/lib/auth/server";
import {
  DegenerateImageError,
  materializeCellImageAsset,
  type MaterializedCellImage,
} from "@/lib/cell-visualization-storage";
import { generateCellVisualizationWithMetrics } from "@/lib/cell-image";
import { getBlobReadWriteToken } from "@/lib/env";
import { checkRateLimit, getRequesterId, moderateText } from "@/lib/guards";
import {
  cellVisualizationResultSchema,
  publishGapSpotlightSchema,
  type CellVisualizationResult,
} from "@/lib/schema";
import {
  addLeaderboardComment,
  applyMapPatch,
  deleteLeaderboardComment,
  deleteLeaderboardEntry,
  getMapBySlug,
  logCellVisualizationRun,
  patchMapCellVisualization,
  publishGapSpotlight,
  updateSpotlightContent,
  viewerCanMutateSpotlight,
} from "@/lib/store";
import { enrichMapDocumentReferenceImages } from "@/lib/map-reference-images";
import {
  buildDiversificationSuffix,
  findHashCollisionAgainstOthers,
} from "@/lib/visualization-diversity";

export type VisualizeCellActionState =
  | { status: "idle" }
  | { status: "success"; result: CellVisualizationResult & { imageModel: string; prompt?: string } }
  | { status: "error"; message: string };

export async function visualizeCellAction(
  _previousState: VisualizeCellActionState,
  formData: FormData,
): Promise<VisualizeCellActionState> {
  // Outer try/catch: any throw here (auth, rate-limit, KV outage, etc.)
  // becomes a returned error state. Without this, the action propagates a
  // raw error which Next.js surfaces as the generic "An unexpected response
  // was received from the server" — leaving the user no actionable retry.
  try {
    const { data: session } = await getAuth().getSession();
    if (!session?.user) {
      return {
        status: "error",
        message: "Sign in to generate images.",
      };
    }

    const sessionUser = session.user as { id?: string | null; email?: string | null };
    const requesterId = sessionUser.id || (await getRequesterId());
    const rateLimit = await checkRateLimit(requesterId);
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

    const mapSlug = String(formData.get("mapSlug") ?? "").trim();
    const cellId = String(formData.get("cellId") ?? "").trim();

    if (!mapSlug || !cellId) {
      return { status: "error", message: "Missing map or cell id." };
    }

    const documentMap = await getMapBySlug(mapSlug);
    if (!documentMap) {
      return { status: "error", message: "Map not found." };
    }
    const viewer = sessionUser.id
      ? { id: sessionUser.id, isAdmin: isAdminEmail(sessionUser.email) }
      : null;
    if (!viewerCanMutateMap(documentMap, viewer)) {
      return {
        status: "error",
        message: "Only the map owner or an admin can generate images for this map.",
      };
    }

    const document = documentMap.document;
    const cell = document.cells.find((candidate) => candidate.id === cellId);
    if (!cell) {
      return { status: "error", message: "Cell not found." };
    }
    const targetCell = cell;
    if (!["gap", "tension", "impossible"].includes(targetCell.status)) {
      return {
        status: "error",
        message: "This cell uses reference-led browsing rather than generated visuals.",
      };
    }
    // Moderate every string that ends up interpolated into the sketch prompt
    // or surfaced in the UI. The cell's label/explanation are LLM-generated
    // (the brief was moderated, but cells weren't), and example names flow
    // verbatim into both the prompt's grounding cues and the drawer caption.
    const exampleStrings = (targetCell.examples ?? []).flatMap((example) => [
      example.name,
      example.brand,
      example.year,
      example.evidenceNote,
      example.description,
    ]);
    const moderationSource = [
      document.title,
      document.domain,
      targetCell.label,
      targetCell.explanation,
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

    const slug = documentMap.slug;

    async function generateAndMaterialize(
      extraPromptSuffix: string,
    ): Promise<{
      materialized: MaterializedCellImage;
      caption?: string;
      usedImageModel: string;
      usedPrompt?: string;
      usedMetrics?: import("@/lib/generation-metrics").CellVisualizationMetrics;
    } | { error: VisualizeCellActionState }> {
      const { result: raw, imageModel: usedImageModel, prompt: usedPrompt, metrics: usedMetrics } =
        await generateCellVisualizationWithMetrics(document, targetCell, {
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
        const materialized = await materializeCellImageAsset(slug, targetCell.id, parsed.data.imageUrl);
        return {
          materialized,
          caption: parsed.data.caption,
          usedImageModel,
          usedPrompt,
          usedMetrics,
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
    const collidingCell = findHashCollisionAgainstOthers(document, targetCell.id, attempt.materialized.byteHash);
    if (collidingCell) {
      console.warn("[visualize_cell] hash_collision", {
        slug,
        cellId: targetCell.id,
        collidedWith: collidingCell.id,
        byteHash: attempt.materialized.byteHash,
      });
      const retryAttempt = await generateAndMaterialize(buildDiversificationSuffix(collidingCell));
      if (!("error" in retryAttempt)) {
        attempt = retryAttempt;
      }
    }

    const updatedAt = new Date().toISOString();
    await patchMapCellVisualization(slug, targetCell.id, {
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

    // Best-effort: log cost telemetry for this visualization run.
    try {
      await logCellVisualizationRun({
        id: `viz_${crypto.randomUUID()}`,
        mapId: documentMap.id,
        cellKey: targetCell.id,
        imageModel: attempt.usedImageModel,
        imageGenerationCalls: attempt.usedMetrics?.imageGenerationCalls ?? 1,
        promptTokens: attempt.usedMetrics?.promptTokens ?? null,
        completionTokens: attempt.usedMetrics?.completionTokens ?? null,
        totalTokens: attempt.usedMetrics?.totalTokens ?? null,
        wallTimeMsTotal: attempt.usedMetrics?.wallTimeMsTotal ?? null,
        createdAt: updatedAt,
      });
    } catch {
      // non-critical
    }
    revalidatePath(`/maps/${slug}`);
    revalidatePath("/maps");

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
      message: "Sign in to publish to the leaderboard.",
    };
  }
  const sessionUser = session.user as { id?: string | null; email?: string | null };

  const parsed = publishGapSpotlightSchema.safeParse({
    mapSlug: String(formData.get("mapSlug") ?? ""),
    cellId: String(formData.get("cellId") ?? ""),
    storyTitle: String(formData.get("storyTitle") ?? "").slice(0, 120),
    storySummary: String(formData.get("storySummary") ?? "").slice(0, 220),
    makePublic: formData.get("makePublic") === "true",
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
    const map = await getMapBySlug(parsed.data.mapSlug);
    const viewer = sessionUser.id
      ? { id: sessionUser.id, isAdmin: isAdminEmail(sessionUser.email) }
      : null;
    if (!map || !viewerCanMutateMap(map, viewer)) {
      return {
        status: "error",
        message: "Only the map owner or an admin can publish this entry.",
      };
    }
    const entry = await publishGapSpotlight({
      ...parsed.data,
      publishedByNeonUserId: sessionUser.id ?? null,
    });
    revalidatePath("/");
    revalidatePath("/leaderboard");
    revalidatePath(`/leaderboard/${entry.slug}`);
    revalidatePath("/maps");
    revalidatePath("/api/leaderboard");
    if (parsed.data.makePublic) {
      revalidatePath(`/maps/${parsed.data.mapSlug}`);
    }

    return {
      status: "success",
      slug: entry.slug,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not publish this entry.",
    };
  }
}

// ---------------------------------------------------------------------------
// Leaderboard entry editing + comments
// ---------------------------------------------------------------------------

export type UpdateSpotlightActionState =
  | { status: "idle" }
  | { status: "success"; slug: string }
  | { status: "error"; message: string };

/**
 * Edit a spotlight's storyTitle / storySummary. Permission mirrors the
 * publish flow: only the source map's owner (or an admin) can mutate.
 */
export async function updateSpotlightAction(
  _previousState: UpdateSpotlightActionState,
  formData: FormData,
): Promise<UpdateSpotlightActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return { status: "error", message: "Sign in to edit this entry." };
  }
  const sessionUser = session.user as { id?: string | null; email?: string | null };

  const slug = String(formData.get("slug") ?? "").trim();
  const storyTitle = String(formData.get("storyTitle") ?? "").trim().slice(0, 120);
  const storySummary = String(formData.get("storySummary") ?? "").trim().slice(0, 220);
  if (!slug || !storyTitle || !storySummary) {
    return { status: "error", message: "Title and summary are required." };
  }

  const moderated = moderateText(`${storyTitle} ${storySummary}`);
  if (!moderated.safe) {
    return {
      status: "error",
      message: moderated.reason ?? "This edit is blocked by moderation.",
    };
  }

  const viewer = {
    id: sessionUser.id ?? null,
    isAdmin: isAdminEmail(sessionUser.email),
  };
  const auth = await viewerCanMutateSpotlight(slug, viewer);
  if (!auth.ok) {
    return {
      status: "error",
      message: "Only the map owner or an admin can edit this entry.",
    };
  }

  const updated = await updateSpotlightContent({ slug, storyTitle, storySummary });
  if (!updated) {
    return { status: "error", message: "Entry not found." };
  }
  revalidatePath("/");
  revalidatePath(`/maps/${updated.mapSlug}`);
  return { status: "success", slug: updated.slug };
}

export type UnpublishSpotlightActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Take a published find off the wall. Mirrors `updateSpotlightAction`'s
 * permission gate (map owner or admin). The source map and its cells are
 * untouched — only the spotlight row (and its cascaded votes/comments)
 * are removed.
 */
export async function unpublishLeaderboardEntryAction(
  _previousState: UnpublishSpotlightActionState,
  formData: FormData,
): Promise<UnpublishSpotlightActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return { status: "error", message: "Sign in to unpublish this entry." };
  }
  const sessionUser = session.user as { id?: string | null; email?: string | null };

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return { status: "error", message: "Missing entry slug." };
  }

  const viewer = {
    id: sessionUser.id ?? null,
    isAdmin: isAdminEmail(sessionUser.email),
  };
  const auth = await viewerCanMutateSpotlight(slug, viewer);
  if (!auth.ok) {
    return {
      status: "error",
      message: "Only the map owner or an admin can unpublish this entry.",
    };
  }

  const removed = await deleteLeaderboardEntry(slug);
  if (!removed) {
    return { status: "error", message: "Entry not found." };
  }
  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath(`/leaderboard/${slug}`);
  revalidatePath(`/maps/${removed.mapSlug}`);
  revalidatePath("/api/leaderboard");
  return { status: "success" };
}

export type LeaderboardCommentActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Post a comment on a spotlight. Open to any signed-in user.
 */
export async function addLeaderboardCommentAction(
  _previousState: LeaderboardCommentActionState,
  formData: FormData,
): Promise<LeaderboardCommentActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return { status: "error", message: "Sign in to leave a comment." };
  }
  const sessionUser = session.user as {
    id?: string | null;
    email?: string | null;
    displayName?: string | null;
  };
  if (!sessionUser.id) {
    return { status: "error", message: "Sign in to leave a comment." };
  }

  const slug = String(formData.get("slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!slug || !body) {
    return { status: "error", message: "Comment can't be empty." };
  }
  if (body.length > 1200) {
    return { status: "error", message: "Comment is too long (max 1200 chars)." };
  }

  const moderated = moderateText(body);
  if (!moderated.safe) {
    return {
      status: "error",
      message: moderated.reason ?? "Comment blocked by moderation.",
    };
  }

  const displayName =
    sessionUser.displayName ?? (sessionUser.email ? sessionUser.email.split("@")[0] : null);
  const result = await addLeaderboardComment({
    slug,
    authorId: sessionUser.id,
    authorDisplayName: displayName,
    body,
  });
  if (!result) {
    return { status: "error", message: "Could not save comment." };
  }
  revalidatePath("/");
  return { status: "success" };
}

export type DeleteCommentActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export async function deleteLeaderboardCommentAction(
  _previousState: DeleteCommentActionState,
  formData: FormData,
): Promise<DeleteCommentActionState> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return { status: "error", message: "Sign in required." };
  }
  const sessionUser = session.user as { id?: string | null; email?: string | null };
  const slug = String(formData.get("slug") ?? "").trim();
  const commentId = String(formData.get("commentId") ?? "").trim();
  if (!slug || !commentId) {
    return { status: "error", message: "Missing comment id." };
  }
  const result = await deleteLeaderboardComment({
    slug,
    commentId,
    viewer: {
      id: sessionUser.id ?? null,
      isAdmin: isAdminEmail(sessionUser.email),
    },
  });
  if (!result.ok) {
    return { status: "error", message: "You can't delete this comment." };
  }
  revalidatePath("/");
  return { status: "success" };
}

export type RefillReferenceImagesState =
  | { status: "idle" }
  | { status: "success"; filled: number }
  | { status: "error"; message: string };

// Admin-only: re-run SerpApi reference enrichment against an existing map.
// `enrichMapDocumentReferenceImages` skips examples that already carry refs,
// so this only fills gaps left by an earlier budget-exhausted or
// circuit-broken generation.
export async function refillMapReferenceImagesAction(
  _prev: RefillReferenceImagesState,
  formData: FormData,
): Promise<RefillReferenceImagesState> {
  const { data: session } = await getAuth().getSession();
  const sessionUser = session?.user as
    | { id?: string | null; email?: string | null }
    | undefined;
  if (!sessionUser || !isAdminEmail(sessionUser.email)) {
    return { status: "error", message: "Admin only." };
  }
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) {
    return { status: "error", message: "Missing map slug." };
  }
  const saved = await getMapBySlug(slug);
  if (!saved) {
    return { status: "error", message: "Map not found." };
  }
  const before = countExamplesWithRefs(saved.document);
  const enriched = await enrichMapDocumentReferenceImages(saved.document);
  const after = countExamplesWithRefs(enriched);
  const patch = await applyMapPatch({
    mapId: saved.id,
    mutate: (current) => ({ ...enriched, slug: current.slug }),
  });
  if (!patch) {
    return { status: "error", message: "Could not persist." };
  }
  revalidatePath(`/maps/${slug}`);
  revalidatePath("/admin/maps");
  return { status: "success", filled: Math.max(0, after - before) };
}

function countExamplesWithRefs(doc: {
  featuredExamples?: Array<{ referenceImages?: unknown[] }>;
  cells?: Array<{ examples?: Array<{ referenceImages?: unknown[] }> }>;
}): number {
  let n = 0;
  for (const ex of doc.featuredExamples ?? []) {
    if ((ex.referenceImages?.length ?? 0) > 0) n++;
  }
  for (const cell of doc.cells ?? []) {
    for (const ex of cell.examples ?? []) {
      if ((ex.referenceImages?.length ?? 0) > 0) n++;
    }
  }
  return n;
}
