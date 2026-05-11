import { CURATED_IMAGE_MODELS } from "@/lib/image-model-options";
import { readEnv } from "@/lib/env";

const openRouterPrimaryModel =
  readEnv("OPENROUTER_MODEL") ?? "google/gemini-3.1-flash-lite-preview";
const openRouterFallbackModel =
  readEnv("OPENROUTER_FALLBACK_MODEL") ?? "google/gemini-3-flash-preview";
const openRouterAppHttpTitle = readEnv("OPENROUTER_APP_NAME") ?? "Lattice";

/** Env-specific chat models allowed for research / suggest steps (unioned with the static list). */
const openRouterExtraAllowedChatModels = Array.from(
  new Set(
    [readEnv("OPENROUTER_RESEARCH_MODEL"), readEnv("OPENROUTER_SUGGEST_MODEL")].filter(
      (m): m is string => typeof m === "string",
    ),
  ),
);

/** Cell idea images: OpenRouter chat completions with `modalities: ["image"]` only. */
export const CELL_IMAGE_MODEL = "bytedance-seed/seedream-4.5" as const;

const curatedImageModelIds = new Set(CURATED_IMAGE_MODELS.map((m) => m.id));

export function isAllowedImageModel(id: string | undefined | null): id is string {
  return typeof id === "string" && curatedImageModelIds.has(id.trim());
}

/** Normalizes client-submitted image model slugs to a safe OpenRouter id. */
export function resolveRequestedImageModel(requested: string | undefined | null): string {
  if (typeof requested !== "string") {
    return CELL_IMAGE_MODEL;
  }
  const t = requested.trim();
  return isAllowedImageModel(t) ? t : CELL_IMAGE_MODEL;
}

export const appConfig = {
  name: "Lattice",
  description: "Turn a topic into a structured map of examples, gaps, and constraints.",
  openRouter: {
    model: openRouterPrimaryModel,
    fallbackModel: openRouterFallbackModel,
    researchModel: readEnv("OPENROUTER_RESEARCH_MODEL") ?? openRouterPrimaryModel,
    /** Axis-pair suggestions only; defaults to primary chat model. */
    suggestModel: readEnv("OPENROUTER_SUGGEST_MODEL") ?? openRouterPrimaryModel,
    siteUrl: readEnv("OPENROUTER_SITE_URL") ?? "http://localhost:3004",
    appHttpTitle: openRouterAppHttpTitle,
    researchHttpTitle:
      readEnv("OPENROUTER_RESEARCH_HTTP_TITLE") ?? `${openRouterAppHttpTitle} Research Engine`,
    allowedModels: [
      openRouterPrimaryModel,
      openRouterFallbackModel,
      "google/gemini-3.1-flash-lite-preview",
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-flash",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
      ...openRouterExtraAllowedChatModels,
    ],
    /** Curated image-output models for cell visualization picker (see lib/image-model-options.ts). */
    imageModels: CURATED_IMAGE_MODELS,
  },
  moderation: {
    bannedTerms: ["sexual minors", "self-harm instructions", "explosives"],
  },
  generation: {
    maxDimensions: 2,
    maxPromptLength: 1500,
    /** Parallel LLM calls for cell matrix slices; SSE is replayed in batch order. */
    cellsBatchConcurrency: (() => {
      const raw = Number(process.env.LATTICE_CELLS_BATCH_CONCURRENCY ?? 2);
      const n = Number.isFinite(raw) ? Math.floor(raw) : 2;
      return Math.min(4, Math.max(1, n));
    })(),
    /**
     * Max SerpApi `google_images` requests per successful map generation (featured examples first, then cell examples until exhausted).
     * Override with `LATTICE_SERP_REFERENCE_MAX_CALLS` to control cost.
     */
    serpReferenceMaxCalls: (() => {
      const raw = Number(process.env.LATTICE_SERP_REFERENCE_MAX_CALLS ?? 8);
      const n = Number.isFinite(raw) ? Math.floor(raw) : 8;
      return Math.min(64, Math.max(0, n));
    })(),
    visualCandidateCount: (() => {
      const raw = Number(process.env.LATTICE_VISUAL_CANDIDATE_COUNT ?? 3);
      const n = Number.isFinite(raw) ? Math.floor(raw) : 3;
      return Math.min(4, Math.max(2, n));
    })(),
    /**
     * Max SerpApi probes per generation used by upstream stages (axis suggestion gate,
     * skeleton-value visual gate, gap-label verification). Separate budget from
     * `serpReferenceMaxCalls` so visual gating cannot starve reference enrichment.
     */
    serpProbeMaxCalls: (() => {
      const raw = Number(process.env.LATTICE_SERP_PROBE_MAX_CALLS ?? 8);
      const n = Number.isFinite(raw) ? Math.floor(raw) : 8;
      return Math.min(64, Math.max(0, n));
    })(),
    /**
     * Axis-pair suggestions are latency-sensitive; keep live image probing off
     * by default and reserve the full probe budget for map generation.
     */
    suggestSerpProbeMaxCalls: (() => {
      const raw = Number(process.env.LATTICE_SUGGEST_SERP_PROBE_MAX_CALLS ?? 0);
      const n = Number.isFinite(raw) ? Math.floor(raw) : 0;
      return Math.min(18, Math.max(0, n));
    })(),
    /** Minimum thumbnails returned by SerpApi probe to consider an axis value/cell label "picturable". */
    visualProbeMinHits: (() => {
      const raw = Number(process.env.LATTICE_VISUAL_PROBE_MIN_HITS ?? 2);
      const n = Number.isFinite(raw) ? Math.floor(raw) : 2;
      return Math.min(8, Math.max(0, n));
    })(),
  },
  rateLimit: {
    windowMs: 10 * 60 * 1000,
    maxRequests: 8,
  },
  /** SerpApi Google Images proxy: requests per IP per window (see app/api/example-images). */
  exampleImagesRateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 48,
  },
};
