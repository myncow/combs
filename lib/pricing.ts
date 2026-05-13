/**
 * Cost helpers for map generation runs and cell visualization runs.
 *
 * All dollar amounts are expressed as fractional USD (e.g. 0.000_001 = $0.000001).
 * "per-million-tokens" prices follow the OpenRouter convention:
 *   cost = (tokens / 1_000_000) * price_per_million
 */

import type { GenerationStageMetric } from "@/lib/generation-metrics";

// ---------------------------------------------------------------------------
// LLM token pricing (USD per 1 M tokens)
// ---------------------------------------------------------------------------

type TokenPrice = {
  promptPerM: number;
  completionPerM: number;
};

/**
 * Best-effort token prices for known OpenRouter model slugs.
 * Values are intentionally conservative (public listed prices at time of
 * writing; update as needed). Unknown models fall back to `DEFAULT_TOKEN_PRICE`.
 */
const TOKEN_PRICES: Record<string, TokenPrice> = {
  "google/gemini-3.1-flash-lite-preview": { promptPerM: 0.10, completionPerM: 0.40 },
  "google/gemini-3-flash-preview":        { promptPerM: 0.075, completionPerM: 0.30 },
  "google/gemini-2.5-flash":              { promptPerM: 0.15, completionPerM: 0.60 },
  "openai/gpt-4.1-mini":                  { promptPerM: 0.40, completionPerM: 1.60 },
  "openai/gpt-4.1-nano":                  { promptPerM: 0.10, completionPerM: 0.40 },
  // image-capable chat models (when used for image-out)
  "google/gemini-3.1-flash-image-preview": { promptPerM: 0.50, completionPerM: 3.00 },
  "google/gemini-3-pro-image-preview":     { promptPerM: 1.25, completionPerM: 5.00 },
  "openai/gpt-5.4-image-2":               { promptPerM: 8.00, completionPerM: 15.00 },
};

/** Fallback for unrecognised model slugs (mid-tier flash equivalent). */
const DEFAULT_TOKEN_PRICE: TokenPrice = { promptPerM: 0.15, completionPerM: 0.60 };

// ---------------------------------------------------------------------------
// Image model pricing
// ---------------------------------------------------------------------------

/**
 * Per-image flat-rate models. Cost is fixed per successful generation call,
 * independent of token count (OpenRouter bills per-image for these).
 */
const PER_IMAGE_PRICES: Record<string, number> = {
  "bytedance-seed/seedream-4.5":   0.04,
  "black-forest-labs/flux.2-max":  0.07,
};

// ---------------------------------------------------------------------------
// SerpApi pricing (Google Images search)
// ---------------------------------------------------------------------------

/** SerpApi charges $0.0025 per search (400 searches / $1). */
export const SERPAPI_COST_PER_CALL = 0.002_5;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Returns the token-based USD cost for a stage metric entry. */
export function stageTokenCost(metric: GenerationStageMetric): number {
  const model = metric.model ?? "";
  const price = TOKEN_PRICES[model] ?? DEFAULT_TOKEN_PRICE;
  const prompt = (metric.promptTokens ?? 0) / 1_000_000;
  const completion = (metric.completionTokens ?? 0) / 1_000_000;
  return prompt * price.promptPerM + completion * price.completionPerM;
}

/**
 * Total LLM cost across all stages that contain token data.
 * Does not include SerpApi or flat-rate image model costs.
 */
export function totalLlmCost(stages: GenerationStageMetric[]): number {
  return stages.reduce((sum, s) => sum + stageTokenCost(s), 0);
}

/** Returns per-image cost if the model is billed per-image, else null. */
export function perImageCost(model: string): number | null {
  return PER_IMAGE_PRICES[model] ?? null;
}

/**
 * Approximate cost for a cell visualization run.
 * imageGenerationCalls is the raw call count (includes retries).
 */
export function cellVisualizationCost(opts: {
  imageModel: string;
  imageGenerationCalls: number;
  promptTokens?: number;
  completionTokens?: number;
}): number {
  const flat = perImageCost(opts.imageModel);
  if (flat !== null) {
    return flat * opts.imageGenerationCalls;
  }
  // Token-based image model
  const price = TOKEN_PRICES[opts.imageModel] ?? DEFAULT_TOKEN_PRICE;
  const prompt = ((opts.promptTokens ?? 0) / 1_000_000) * price.promptPerM;
  const completion = ((opts.completionTokens ?? 0) / 1_000_000) * price.completionPerM;
  return prompt + completion;
}

// ---------------------------------------------------------------------------
// Breakdown types
// ---------------------------------------------------------------------------

export type CostLineItem = {
  label: string;
  usd: number;
  detail?: string;
};

export type MapCostBreakdown = {
  /** Total cost for the initial map generation (LLM tokens + SerpApi probes + reference images). */
  generationUsd: number;
  generationLines: CostLineItem[];
  /** Sum of all on-demand cell visualization runs. */
  visualizationUsd: number;
  visualizationLines: CostLineItem[];
  /** Grand total. */
  totalUsd: number;
};

/** Format a USD amount for display (e.g. "$0.0032"). */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}
