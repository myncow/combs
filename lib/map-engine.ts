import { appConfig } from "@/lib/config";
import {
  emitStep,
  type GenerationStreamSink,
  type GenerationTraceEvent,
} from "@/lib/generation-stream";
import {
  mapBriefSchema,
  mapDocumentSchema,
  normalizedMapBriefSchema,
  mapSkeletonSchema,
  mapCellsBatchSchema,
  suggestAxisPairsResponseSchema,
  type SuggestAxisPairInput,
  type MapBriefInput,
  type NormalizedMapBriefInput,
  type MapSkeletonInput,
  type MapCellsBatchInput,
  type SuggestAxisPairsResponse,
} from "@/lib/schema";
import { callStructuredModel, type StructuredModelAttemptHook } from "@/lib/openrouter";
import { callStructuredModelStreaming } from "@/lib/openrouter-stream";
import {
  fetchResearchContext,
  getResearchGroundingState,
  type ResearchContext,
} from "@/lib/research-engine";
import {
  normalizedMapBriefJsonSchema,
  mapSkeletonJsonSchema,
  mapCellsJsonSchema,
  suggestAxisPairsResponseJsonSchema,
} from "@/lib/openrouter-schemas";
import { buildFallbackMapDocument } from "@/lib/map-fallback-document";
import { enrichMapDocumentReferenceImages } from "@/lib/map-reference-images";
import { attachVisualSeries } from "@/lib/visual-series";
import type { GenerationMetricsCollector } from "@/lib/generation-metrics";
import { applyMapPatch } from "@/lib/store";
import type {
  GenerationJobResult,
  MapBrief,
  MapCell,
  MapCellStatus,
  MapConstraint,
  MapDocument,
  MapExample,
  MapReferenceImage,
  NormalizedMapBrief,
} from "@/lib/types";
import { stripTaxonomyWords } from "@/lib/sanitize-taxonomy";
import { exampleImageSearchQuery, slugify, titleCase } from "@/lib/utils";
import {
  PROBE_DEFAULT_CONCURRENCY,
  createProbeBudget,
  probePairsByAxisValues,
  probeLabelPicturability,
  type ProbeBudget,
  type ProbeResult,
} from "@/lib/visual-probe";
import { getSerpApiKey } from "@/lib/serpapi-images";

export { stripTaxonomyWords };

function flushStructuredAttempts(
  collector: GenerationMetricsCollector | undefined,
  stageId: string,
  nominalModel: string,
  attempts: Array<{ model: string; durationMs: number; parsedOk: boolean }>,
  extras?: Record<string, unknown>,
) {
  if (!collector || attempts.length === 0) return;
  const firstOkIndex = attempts.findIndex((a) => a.parsedOk);
  const fallbackUsed =
    attempts.length > 1 && attempts.some((attempt, index) => attempt.parsedOk && index > 0);
  const durationMsTotal = attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0);
  collector.addStructuredCallMetrics({
    stageId,
    durationMs: durationMsTotal,
    model: nominalModel,
    externalCallCount: attempts.length,
    retryCount: firstOkIndex >= 0 ? firstOkIndex : Math.max(0, attempts.length - 1),
    fallbackUsed,
    extras,
  });
}

async function runStructuredModel<T>({
  model,
  instructions,
  input,
  schemaName,
  jsonSchema,
  step,
  sink,
  collector,
  metricStageId,
  metricExtras,
  flushMetrics,
  temperature,
  signal,
}: {
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  step: string;
  sink?: GenerationStreamSink;
  collector?: GenerationMetricsCollector;
  metricStageId?: string;
  metricExtras?: Record<string, unknown>;
  flushMetrics?: boolean;
  /** Only forwarded when not streaming (no sink). */
  temperature?: number;
  signal?: AbortSignal;
}): Promise<T | null> {
  const stageKey = metricStageId ?? step;
  const shouldRecordAttempts = Boolean(collector) && flushMetrics !== false;
  const attempts: Array<{ model: string; durationMs: number; parsedOk: boolean }> = [];
  const onAttempts: StructuredModelAttemptHook | undefined = shouldRecordAttempts
    ? (info) => {
        attempts.push({ model: info.model, durationMs: info.durationMs, parsedOk: info.parsedOk });
      }
    : undefined;

  let result: T | null;
  if (sink) {
    result = await callStructuredModelStreaming<T>({
      model,
      instructions,
      input,
      schemaName,
      jsonSchema,
      step,
      sink,
      onAttempts,
    });
  } else {
    result = await callStructuredModel<T>({
      model,
      instructions,
      input,
      schemaName,
      jsonSchema,
      onAttempts,
      temperature,
      signal,
    });
  }

  if (collector && shouldRecordAttempts && attempts.length) {
    flushStructuredAttempts(collector, stageKey, model, attempts, metricExtras);
  }
  return result;
}

const defaultDimensionDescriptions = [
  "A core axis that helps explain meaningful variation within the domain.",
  "A second axis that users can intuitively scan on a visual map.",
];

function inferTopicFamily(topic: string) {
  const lowered = topic.toLowerCase();
  if (/(bread|tea|cocktail|noodle|food|cheese|sausage|pickle)/.test(lowered)) {
    return "Food & Drink";
  }
  if (/(architecture|building|material)/.test(lowered)) {
    return "Design";
  }
  return "General";
}

function deriveDimensions(brief: MapBrief) {
  const rawDimensions = brief.candidateDimensions.length
    ? brief.candidateDimensions
    : ["Structure", "Process"];

  const sliced = rawDimensions.slice(0, appConfig.generation.maxDimensions);
  while (sliced.length < appConfig.generation.maxDimensions) {
    const filler = ["Structure", "Process"][sliced.length];
    sliced.push(filler);
  }

  return sliced.map((label, index) => ({
    key: slugify(label),
    label: titleCase(label),
    description: defaultDimensionDescriptions[index] ?? defaultDimensionDescriptions[1],
  }));
}

function heuristicNormalizeBrief(brief: MapBrief): NormalizedMapBrief {
  return normalizedMapBriefSchema.parse({
    ...brief,
    domain: titleCase(brief.topic),
    topicFamily: inferTopicFamily(brief.topic),
    dimensions: deriveDimensions(brief),
    accepted: true,
    guidance: ["Provide more details for a better map"],
  });
}

function heuristicSuggestAxisPairs(brief: MapBrief): SuggestAxisPairsResponse {
  const t = brief.topic.trim();
  const templates: ReadonlyArray<readonly [string, string]> = [
    ["Material basis", "Form factor"],
    ["Processing stage", "Use context"],
    ["Physical scale", "Time or era"],
    ["Structural regime", "Surface or finish"],
  ];

  const pairs = templates.map(([a, b], i) => ({
    primary: {
      key: slugify(a),
      label: titleCase(a),
      description: `Picturable variation for ${t}.`,
      values: buildValueSet(a),
    },
    secondary: {
      key: slugify(b),
      label: titleCase(b),
      description: `Picturable variation for ${t}.`,
      values: buildValueSet(b),
    },
    rationale: `Option ${i + 1}: crosses ${titleCase(a)} with ${titleCase(b)} to surface sparse quadrants.`,
  }));

  return suggestAxisPairsResponseSchema.parse({ pairs });
}

/**
 * Hotter than the prior 0.25 because the schema now permits 4–8 candidates
 * and we deduplicate / re-rank deterministically downstream. At 0.25 the model
 * collapsed onto near-identical pairs across slots; 0.55 broadens coverage
 * without making pair quality unstable.
 */
const SUGGEST_AXIS_PAIR_TEMPERATURE = 0.55;

const SUGGEST_AXIS_RETRY_SUFFIX = `

REMEDIATION (required): Your previous output was rejected for relying on abstract positioning, price tiers, or research-jargon axes. Regenerate the candidate list from scratch.
- Every axis LABEL and every VALUE tick must name something visible in a single photograph (material, silhouette, setting, process stage, surface finish, scale, era-typical form).
- Do not use premium, luxury, budget-tier, brand tier, market position, sentiment, innovation stage, high-end/low-end positioning, or similar non-scene language anywhere in labels, values, descriptions, or rationales.
- Keep orthogonality and diversity across pairs; still prefer crossings where sparse quadrants can matter, but only after photographic legibility is satisfied.`;

/** Phrases that usually denote non-photographic / tier axes—used to filter or trigger one retry. */
const SUGGEST_AXIS_VIBE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(?:premium|luxury|prestige)\b/i,
  /\bbrand\s+tier\b/i,
  /\bmarket\s+position(?:ing)?\b/i,
  /\bprice\s+point\b/i,
  /\bsentiment\b/i,
  /\binnovation\s+stage\b/i,
  /\buser\s+perception\b/i,
  /\b(?:high-end|low-end)\b/i,
];

function suggestPairFailsVibeGuard(pair: SuggestAxisPairInput): boolean {
  const haystack = [
    pair.primary.label,
    pair.primary.description ?? "",
    pair.secondary.label,
    pair.secondary.description ?? "",
    pair.rationale ?? "",
    ...pair.primary.values,
    ...pair.secondary.values,
  ].join(" | ");

  return SUGGEST_AXIS_VIBE_PATTERNS.some((re) => re.test(haystack));
}

const SUGGEST_AXIS_INSTRUCTIONS = `You are the intake editor for Lattice, a tool that builds gap-first combinatorial maps (any subject matter). Your axis-quality rules match normalized brief intake, but you return a brainstormed candidate list of axis pairs instead of locking one.
Return JSON only. No markdown.

Priority (strict order):
1) Photographic legibility: each axis must be readable as variation in a single hero image or quick sketch / image search.
2) Orthogonal, concrete, distinct primary vs secondary.
3) Among visually legible choices, prefer crossings where sparse quadrants can surface gaps, tensions, or impossibles—not dense grids where every cell is crowded. Never sacrifice (1) for (3).

Axis and value rules (same stack as normalize + map skeleton):
- Each item in "pairs" is ONE candidate 2D map: "primary" and "secondary" are the only two axes.
- Reject scalar "vibes" axes: cheap↔premium, simple↔complex as abstract scores, mood/sentiment continuums, sentiment, user-perception, "innovation stage", brand tier, market position, luxury/prestige tiers—unless rewritten into outward, scene-stable cues.
- Reject INTERNAL or INVISIBLE axes that cannot be photographed at the implied viewpoint (e.g. hardware: "boiler architecture", "chipset", "firmware tier"; food: hidden chemistry specs; fashion: fiber denier inside yarn). REWRITE the user's intent into the outward photographic cue (boiler → panel & group-head silhouette; chipset → case footprint & port cluster; hidden fiber spec → weave pattern & light scatter).
- Each axis MUST be visualizable: materials, physical form, setting, process stage, format, era-typical silhouette, scale, surface/finish—things a user could sketch or image-search.
- Keys: lowercase kebab-case. Labels: short, legible noun phrases.
- "description" clarifies the axis in one short phrase, or use empty string "" if redundant.
- Each axis must include three to five "values" strings (pick the count that fits the brief). These are draft row/column ticks: concise, NOUN-LIKE, scene-stable, picturable—concrete materials, formats, settings, process stages, or form factors. Avoid long clauses, mood words, score-like qualifiers, and ticks that name hidden internals.
- Do not default every axis to exactly three ticks unless the brief warrants it—mix three-, four-, and five-value axes across pairs when it improves separation.
- "rationale" is one sentence on why this pair fits the supplied brief, or "".
- Pairs must be DIVERSE—do not repeat near-identical axes across pairs. Vary the underlying property family between pairs (material vs. process vs. form vs. setting vs. era), so a downstream filter can pick the strongest among meaningfully different options.
- Return between 6 and 8 brainstormed candidates. A deterministic post-filter will dedupe, vet, and rank them; emit more options rather than fewer so we have headroom to drop weak picks.
- Treat candidateDimensions, mustIncludeExamples, mustAvoid, combines, constraints, and extraContext in the input JSON as authoritative guardrails.
- FORBIDDEN WORDS in labels, descriptions, rationales: "taxonomy", "taxonomic", "taxonomical". Use "map", "structure", "organization", or plain domain words.

Emit between 6 and 8 objects in "pairs". The post-filter will keep at most 4 to surface to the user.`;

async function callSuggestAxisPairsModel(
  brief: MapBrief,
  instructionsSuffix: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  return runStructuredModel<unknown>({
    model: appConfig.openRouter.suggestModel,
    instructions: SUGGEST_AXIS_INSTRUCTIONS + instructionsSuffix,
    input: JSON.stringify(brief),
    schemaName: "suggest_axis_pairs",
    jsonSchema: suggestAxisPairsResponseJsonSchema,
    step: "suggest_axis_pairs",
    temperature: SUGGEST_AXIS_PAIR_TEMPERATURE,
    signal,
  });
}

function pairFingerprint(pair: SuggestAxisPairInput): string {
  const sides = [pair.primary, pair.secondary]
    .map((side) => slugify(side.label).toLowerCase())
    .sort();
  return sides.join("|");
}

function dedupePairsByFingerprint(pairs: SuggestAxisPairInput[]): SuggestAxisPairInput[] {
  const seen = new Set<string>();
  const out: SuggestAxisPairInput[] = [];
  for (const pair of pairs) {
    const key = pairFingerprint(pair);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
  }
  return out;
}

/**
 * Rank pairs by visual yield from a SerpApi probe. Three tiers:
 *   tier 0: probed and at least one value yielded thumbnails
 *   tier 1: not probed at all (budget exhausted before reaching this pair)
 *   tier 2: probed and zero values yielded thumbnails (worst signal)
 *
 * Within each tier pairs are sorted by picturable ratio, then by absolute hit
 * count, then by original model order. Skipped silently when SERPAPI is not
 * configured — the LLM's vibe guard remains the only filter in that case.
 */
async function rankPairsByVisualYield(
  pairs: SuggestAxisPairInput[],
  topic: string,
  budget: ProbeBudget,
): Promise<SuggestAxisPairInput[]> {
  if (!getSerpApiKey() || budget.remaining() === 0 || pairs.length <= 1) {
    return pairs;
  }
  const stats = await probePairsByAxisValues(pairs, topic, budget);
  const indexed = pairs.map((pair, index) => ({ pair, stat: stats[index], index }));

  function tierFor(stat: (typeof stats)[number]): 0 | 1 | 2 {
    if (!stat.probedAny) return 1;
    return stat.totalHits > 0 ? 0 : 2;
  }

  // If at least one pair was probed and yielded hits (tier 0), drop the
  // pairs we probed and verified as zero-hit (tier 2). Unprobed pairs
  // (tier 1) are kept because they're "unknown", not "bad".
  const anyTierZero = indexed.some((entry) => tierFor(entry.stat) === 0);
  const filtered = anyTierZero
    ? indexed.filter((entry) => tierFor(entry.stat) !== 2)
    : indexed;

  filtered.sort((a, b) => {
    const tierA = tierFor(a.stat);
    const tierB = tierFor(b.stat);
    if (tierA !== tierB) return tierA - tierB;
    if (b.stat.picturableRatio !== a.stat.picturableRatio) {
      return b.stat.picturableRatio - a.stat.picturableRatio;
    }
    if (b.stat.totalHits !== a.stat.totalHits) {
      return b.stat.totalHits - a.stat.totalHits;
    }
    return a.index - b.index;
  });

  return filtered.map((entry) => entry.pair);
}

export async function suggestAxisPairs(
  briefInput: MapBriefInput,
  options?: { signal?: AbortSignal; probeLimit?: number },
): Promise<SuggestAxisPairsResponse> {
  const brief = mapBriefSchema.parse(briefInput);

  const response = await callSuggestAxisPairsModel(brief, "", options?.signal);
  const parsed = suggestAxisPairsResponseSchema.safeParse(response);

  if (!parsed.success || response == null) {
    console.warn("[suggest_axis_pairs] using_heuristic_fallback", {
      reason: response == null ? "null_or_missing_response" : "zod_parse_failed",
    });
    return heuristicSuggestAxisPairs(brief);
  }

  const filterVisual = (pairs: SuggestAxisPairInput[]) =>
    pairs.filter((p) => !suggestPairFailsVibeGuard(p));

  // Dedupe before ranking so a model that emits near-duplicates doesn't waste probe budget on them.
  let good = dedupePairsByFingerprint(filterVisual(parsed.data.pairs));

  if (good.length === 0) {
    console.warn("[suggest_axis_pairs] all_pairs_failed_vibe_guard_retrying");
    const retryResponse = await callSuggestAxisPairsModel(
      brief,
      SUGGEST_AXIS_RETRY_SUFFIX,
      options?.signal,
    );
    const retryParsed = suggestAxisPairsResponseSchema.safeParse(retryResponse);
    if (retryParsed.success) {
      good = dedupePairsByFingerprint(filterVisual(retryParsed.data.pairs));
    }
    if (good.length === 0) {
      console.warn("[suggest_axis_pairs] using_unfiltered_model_output_after_retry");
      return { pairs: dedupePairsByFingerprint(parsed.data.pairs).slice(0, 4) };
    }
  }

  const probeBudget = createProbeBudget(
    options?.probeLimit ?? appConfig.generation.suggestSerpProbeMaxCalls,
    { signal: options?.signal },
  );
  const ranked = await rankPairsByVisualYield(good, brief.topic, probeBudget);
  return { pairs: ranked.slice(0, 4) };
}

function buildValueSet(label: string) {
  const presets: Record<string, string[]> = {
    structure: ["Simple", "Layered", "Dense"],
    process: ["Fresh", "Aged", "Fermented"],
    context: ["Everyday", "Regional", "Experimental"],
    grain: ["Wheat", "Rye", "Rice"],
    fermentation: ["None", "Yeast", "Sourdough"],
    cooking: ["Baked", "Steamed", "Fried"],
    sweetness: ["Dry", "Balanced", "Sweet"],
    freshness: ["Airy", "Green", "Resinous"],
  };

  return presets[slugify(label)] ?? ["Low", "Middle", "High"];
}

function statusForIndex(index: number, total: number) {
  if (index === 0 || index === total - 1) {
    return "existing" as const;
  }
  if (index % 4 === 1) {
    return "rare" as const;
  }
  if (index % 4 === 2) {
    return "gap" as const;
  }
  return "impossible" as const;
}

export function heuristicMapDocument(brief: NormalizedMapBrief): MapDocument {
  return buildFallbackMapDocument(brief);
}

export function formatResearchForPrompt(research: ResearchContext, purpose: "skeleton" | "cells") {
  if (!research.summary) {
    return "";
  }

  const groundingState = getResearchGroundingState(research);
  const entityLimit = purpose === "skeleton" ? 24 : 45;
  const entityLedger = research.entityHints.length
    ? research.entityHints
        .slice(0, entityLimit)
        .map((entity) => [entity.name, entity.brand, entity.category, entity.evidence].filter(Boolean).join(" | "))
        .join("\n")
    : research.knownEntities.slice(0, entityLimit).join(", ");
  const axisHints = research.axisHints.length
    ? research.axisHints.slice(0, 12).map((hint) => `- ${hint}`).join("\n")
    : "No parsed axis hints; infer from the source notes.";
  const constraintHints = research.constraintHints.length
    ? research.constraintHints.slice(0, 18).map((hint) => `- ${hint}`).join("\n")
    : "No parsed constraint hints; infer from the source notes.";
  const heading =
    groundingState === "sourced"
      ? "GROUNDED RESEARCH PACK (from live web search; use this as evidence, not decoration):"
      : "UNSOURCED RESEARCH NOTES (model-generated synthesis without retrieved citations; treat as weak brainstorming, not as evidence):";
  const trustNotice =
    groundingState === "unsourced"
      ? "\nNOTE: No cited sources were retrieved. Use these notes only as weak brainstorming; do not treat them as authoritative evidence."
      : "";

  return `
${heading}
---
${research.summary}
---
AXIS HINTS:
${axisHints}

CONSTRAINT HINTS:
${constraintHints}

ENTITY LEDGER:
${entityLedger || "No named entities found."}

SOURCES:
${research.sources.slice(0, 8).join("\n") || "No cited sources returned."}
${trustNotice}
`;
}

const universalMapContract = `
Universal map contract (same rules for every topic):
- Axis fidelity: Populate the full primary matrix declared in the skeleton. Every coordinate uses skeleton dimension keys and only values enumerated for that dimension unless the explanation explicitly declares a sanctioned extension. Matching is strict—reuse the skeleton's exact value strings character-for-character (punctuation and spacing included) so downstream coverage checks succeed; paraphrased or "cleaned up" tick labels count as missing cells.
- No axis drift mid-pass: Never introduce new axes, synonyms for keys, or untracked value labels outside the skeleton and normalized brief.
- Named anchors: Examples must cite identifiable referents (named artifacts, regimes, specimens, canon entries, regimes of practice)—not rhetorical moods, unnamed styles, generic classes, or adjective stacks pretending to be names.
- Evidence routing: Prefer the GROUNDED RESEARCH PACK; outside that rely only on stable common knowledge readers would broadly accept without specialty invention. Thin evidence → downgrade status and articulate epistemic limits in the prose.
- Anti-fabrication: Omit SKU-level detail rather than speculate (brands/dates/origins/competition outcomes). Prefer leaving optional fields absent over invented precision.
- Status semantics — "existing" needs two distinct anchors each meeting the verifier bar below; "rare" needs exactly one; "gap/tension/impossible" follow the skeletal prompt definitions while stating which rule binds.
- verifier bar each anchor: substantive evidenceNote OR explicit brand/origin/date/creator lineage OR a description (same object) of ≥48 characters that states what the anchor is and why it belongs in this cell—not filler strings.
- Low research throughput: prioritize gap/tension labels, avoid overcrowding "existing", and forbid promotional-sounding specificity without corroborating context.
- Gap-first intent: This map is a gap visualizer. "gap" and "tension" cells are first-class outputs, not placeholders—label them whenever a crossing is plausible-but-underfilled or structurally constrained, and write explanations that describe what WOULD need to exist to fill the cell in concrete, picturable terms (material, form, setting, process) so the user can imagine or image-search it.
- Visualizable cells: Because every axis value is picturable, every filled cell should be something a user could visualize; keep cell labels short and scene-stable for the same reason.
`;

const ARTICLE_STOPWORDS = new Set(["a", "an", "the", "of", "for", "and", "or", "to", "in", "on", "with"]);

function firstSignificantWords(value: string, count = 3): string {
  const tokens = value
    .split(/[^A-Za-z0-9]+/)
    .filter((token) => token && !ARTICLE_STOPWORDS.has(token.toLowerCase()));
  return tokens.slice(0, Math.max(1, count)).join(" ");
}

function buildFallbackTitleFromBrief(brief: NormalizedMapBrief): string {
  const topicTokens = brief.topic ? firstSignificantWords(brief.topic, 3) : "";
  if (topicTokens) {
    return `${titleCase(topicTokens)} Map`;
  }
  const domainTokens = brief.domain ? firstSignificantWords(brief.domain, 3) : "";
  if (domainTokens) {
    return `${titleCase(domainTokens)} Map`;
  }
  return "Lattice Map";
}

export function sanitizeMapTitle(rawTitle: string, brief: NormalizedMapBrief): string {
  const stripped = stripTaxonomyWords(rawTitle ?? "");
  const isDegraded =
    !stripped ||
    stripped.length < 3 ||
    /^[^A-Za-z0-9]+$/.test(stripped) ||
    /^(map|guide|chart|atlas)$/i.test(stripped);

  if (isDegraded) {
    return buildFallbackTitleFromBrief(brief);
  }
  return stripped;
}

/**
 * Generic placeholder brand/name fragments models reach for when they cannot
 * cite a real anchor: "Industry Standard", "Generic Prototype", "Custom",
 * "Concept Recovery Cruiser", etc. These slip past evidence checks because
 * they're nominally non-empty strings, but they're fabrications and need to
 * downgrade the surrounding cell to gap/rare.
 */
const PLACEHOLDER_BRAND_PATTERNS = [
  /\b(generic|industry standard|specialized [a-z]+ footwear|industry|prototype|concept(?:ual)?|custom|hypothetical|fictional|theoretical|imagined|placeholder|representative)\b/i,
  /^(none|n\/a|unknown|various|tba|tbd)$/i,
];

const PLACEHOLDER_NAME_PATTERNS = [
  /\b(prototype|hypothetical|fictional|theoretical|imagined|placeholder|representative|generic)\b/i,
  /\b(?:no exemplar|illustrative example|example product|example item|sample [a-z]+)\b/i,
  // Gap-verification stubs are anchored by image search hits, not real
  // referents; reject them as featured-example candidates so they never
  // leak into the publish-ready ledger.
  /^search candidate(?:\s|·|$)/i,
];

const MODDED_NAME_PATTERNS = [
  /\bmod(?:ded)?\b/i,
  /\bretrofit(?:ted)?\b/i,
  /\bconversion\b/i,
  /\brestomod\b/i,
  /\bcustom(?:ized)?\b/i,
  /\bclone\b/i,
  /\breplica\b/i,
  /\bhomage\b/i,
  /\btribute\b/i,
];

const SUPPORTIVE_FRONTIER_PATTERNS = [
  /\bwould need\b/i,
  /\brequires?\b/i,
  /\bunderdeveloped\b/i,
  /\bconstrained?\b/i,
  /\bmissing\b/i,
  /\brare due to\b/i,
  /\bnot yet\b/i,
];

const RULE_BASED_IMPOSSIBLE_PATTERNS = [
  /\bincompatible\b/i,
  /\bcannot\b/i,
  /\bconflict\b/i,
  /\bprevent\b/i,
  /\bmechanic(?:al|ally)\b/i,
  /\bphysic(?:al|ally)\b/i,
  /\bredundant\b/i,
  /\bstructur(?:al|ally)\b/i,
];

function looksLikePlaceholderBrand(brand: string | undefined): boolean {
  if (!brand) return false;
  const trimmed = brand.trim();
  if (!trimmed) return false;
  return PLACEHOLDER_BRAND_PATTERNS.some((re) => re.test(trimmed));
}

function looksLikePlaceholderName(name: string | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return PLACEHOLDER_NAME_PATTERNS.some((re) => re.test(trimmed));
}

function looksLikeModifiedAnchorName(name: string | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return MODDED_NAME_PATTERNS.some((re) => re.test(trimmed));
}

function normalizeExampleParentIdentity(raw: string): string {
  let normalized = normalizeAnchorName(raw)
    .replace(/\b(mod|modded|retrofit|retrofitted|conversion|restomod|custom|customized|clone|replica|homage|tribute)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length >= 2) {
    while (tokens.length >= 3 && /^[a-z]$/.test(tokens[tokens.length - 1] ?? "")) {
      tokens.pop();
    }
  }

  normalized = tokens.join(" ").trim();
  return normalized;
}

export function exampleParentIdentity(example: Pick<MapExample, "name" | "brand">): string {
  const composite = [example.brand, example.name].filter(Boolean).join(" ").trim();
  return normalizeExampleParentIdentity(composite || example.name || "");
}

/**
 * Normalize an anchor name so we can detect "Pane di Altamura PDO" vs
 * "Pane di Altamura (Non-PDO variant)" as the same parent product. Strips
 * parenthetical qualifiers, version/edition markers, and common variant words.
 */
function normalizeAnchorName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(pdo|igp|dop|aoc|aop|pgi)\b/g, " ")
    .replace(/\bv?\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b(non|new|old|classic|original|prototype|edition|variant|version|model|gen|generation|mk)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * If the same anchor appears in multiple cells, keep it in only one cell —
 * the one whose status best matches a sourced example (existing > rare >
 * everything else), tie-broken by cell whose label matches the anchor most.
 *
 * Mutates `cells` in place by rewriting `examples` arrays.
 */
function pruneDuplicateAnchorsAcrossCells(cells: MapDocument["cells"]) {
  type Occ = { cell: MapDocument["cells"][number]; example: MapExample };
  const groups = new Map<string, Occ[]>();
  for (const cell of cells) {
    for (const example of cell.examples) {
      const key = normalizeAnchorName(example.name);
      if (!key || key.length < 3) continue;
      const list = groups.get(key) ?? [];
      list.push({ cell, example });
      groups.set(key, list);
    }
  }

  const statusRank: Record<MapExample["status"], number> = {
    existing: 4,
    rare: 3,
    tension: 2,
    gap: 1,
    impossible: 0,
  };

  for (const [, occurrences] of groups) {
    if (occurrences.length < 2) continue;
    const sorted = [...occurrences].sort((a, b) => {
      const rankDiff = statusRank[b.cell.status] - statusRank[a.cell.status];
      if (rankDiff !== 0) return rankDiff;
      const aMatch = a.cell.label.toLowerCase().includes(a.example.name.toLowerCase().split(" ")[0] ?? "")
        ? 1
        : 0;
      const bMatch = b.cell.label.toLowerCase().includes(b.example.name.toLowerCase().split(" ")[0] ?? "")
        ? 1
        : 0;
      return bMatch - aMatch;
    });
    const keeper = sorted[0];
    for (const occ of occurrences) {
      if (occ.cell === keeper.cell && occ.example === keeper.example) continue;
      occ.cell.examples = occ.cell.examples.filter((ex) => ex !== occ.example);
    }
  }
}

/** Named instance + verifiable hook: brand, year, substantive note, or clearly argued description (models often put proof in description). */
export function hasConcreteExample(example: MapExample): boolean {
  const nameOk = Boolean(example.name?.trim());
  if (!nameOk) return false;
  if (looksLikePlaceholderName(example.name)) return false;
  if (looksLikePlaceholderBrand(example.brand)) return false;
  if (looksLikeModifiedAnchorName(example.name)) return false;
  const note = example.evidenceNote?.trim() ?? "";
  const brandOk = Boolean(example.brand?.trim()) && !looksLikePlaceholderBrand(example.brand);
  const yearOk = Boolean(example.year?.trim());
  const descOk = (example.description?.trim().length ?? 0) >= 48;
  return brandOk || yearOk || note.length >= 12 || descOk;
}

function exampleEvidenceScore(example: MapExample): number {
  let score = 0;
  if (example.brand?.trim()) score += 4;
  if (example.year?.trim()) score += 2;
  if ((example.evidenceNote?.trim().length ?? 0) >= 12) score += 2;
  if ((example.description?.trim().length ?? 0) >= 48) score += 1;
  if ((example.referenceImages?.length ?? 0) > 0) score += 1;
  if (!looksLikeModifiedAnchorName(example.name) && exampleParentIdentity(example) === normalizeExampleParentIdentity(example.name)) {
    score += 1;
  }
  return score;
}

function dedupeConcreteExamplesByParent(examples: MapExample[]): MapExample[] {
  const preferredByParent = new Map<string, MapExample>();
  for (const example of examples.filter(hasConcreteExample)) {
    const parent = exampleParentIdentity(example);
    if (!parent) {
      continue;
    }
    const existing = preferredByParent.get(parent);
    if (!existing) {
      preferredByParent.set(parent, example);
      continue;
    }
    const scoreDiff = exampleEvidenceScore(example) - exampleEvidenceScore(existing);
    if (
      scoreDiff > 0 ||
      (scoreDiff === 0 && example.name.length < existing.name.length) ||
      (scoreDiff === 0 && example.name.length === existing.name.length && example.name.localeCompare(existing.name) < 0)
    ) {
      preferredByParent.set(parent, example);
    }
  }
  return [...preferredByParent.values()];
}

function distinctConcreteParentCount(examples: MapExample[]): number {
  return new Set(dedupeConcreteExamplesByParent(examples).map((example) => exampleParentIdentity(example))).size;
}

function stripReferenceImageMeta(images: MapReferenceImage[] | undefined): MapReferenceImage[] | undefined {
  if (!images?.length) {
    return images;
  }
  return images.map((img) => ({
    ...img,
    title: img.title ? stripTaxonomyWords(img.title) || img.title : undefined,
    source: img.source ? stripTaxonomyWords(img.source) || img.source : undefined,
  }));
}

function stripGenerationExample(example: MapExample): MapExample {
  return {
    ...example,
    name: stripTaxonomyWords(example.name) || example.name,
    description: stripTaxonomyWords(example.description) || example.description,
    evidenceNote: example.evidenceNote ? stripTaxonomyWords(example.evidenceNote) || example.evidenceNote : undefined,
    brand: example.brand ? stripTaxonomyWords(example.brand) || example.brand : undefined,
    referenceImages: stripReferenceImageMeta(example.referenceImages),
  };
}

/** Remove forbidden taxonomy-family wording from generated copy (research/Serp captions can leak it too). */
function stripTaxonomyFromGeneratedMap(document: MapDocument): MapDocument {
  const strip = stripTaxonomyWords;

  return {
    ...document,
    title: strip(document.title) || document.title,
    summary: strip(document.summary) || document.summary,
    intro: strip(document.intro) || document.intro,
    domain: strip(document.domain) || document.domain,
    topicFamily: strip(document.topicFamily) || document.topicFamily,
    dimensions: document.dimensions.map((dimension) => ({
      ...dimension,
      label: strip(dimension.label) || dimension.label,
      description: strip(dimension.description) || dimension.description,
      values: dimension.values.map((value) => strip(value) || value),
    })),
    cells: document.cells.map((cell) => ({
      ...cell,
      label: strip(cell.label) || cell.label,
      explanation: strip(cell.explanation) || cell.explanation,
      badges: cell.badges.map((badge) => strip(badge) || badge),
      examples: cell.examples.map(stripGenerationExample),
      visualization: cell.visualization
        ? {
            ...cell.visualization,
            caption: cell.visualization.caption ? strip(cell.visualization.caption) || cell.visualization.caption : undefined,
          }
        : undefined,
    })),
    featuredExamples: document.featuredExamples.map(stripGenerationExample),
    notableGaps: document.notableGaps.map((gap) => ({
      ...gap,
      label: strip(gap.label) || gap.label,
      explanation: strip(gap.explanation) || gap.explanation,
    })),
    impossibleCombos: document.impossibleCombos.map((combo) => ({
      ...combo,
      label: strip(combo.label) || combo.label,
      explanation: strip(combo.explanation) || combo.explanation,
    })),
    constraints: document.constraints.map((constraint) => ({
      ...constraint,
      label: strip(constraint.label) || constraint.label,
      explanation: strip(constraint.explanation) || constraint.explanation,
    })),
    renderingHints: {
      ...document.renderingHints,
      accent: strip(document.renderingHints.accent) || document.renderingHints.accent,
      gradient: document.renderingHints.gradient.map((hex) => strip(hex) || hex),
      icon: document.renderingHints.icon ? strip(document.renderingHints.icon) || document.renderingHints.icon : undefined,
    },
    seo: {
      title: strip(document.seo.title) || document.seo.title,
      description: strip(document.seo.description) || document.seo.description,
    },
    visualSeries: document.visualSeries
      ? {
          ...document.visualSeries,
          label: strip(document.visualSeries.label) || document.visualSeries.label,
          overview: strip(document.visualSeries.overview) || document.visualSeries.overview,
          styleSpec: {
            ...document.visualSeries.styleSpec,
            medium: strip(document.visualSeries.styleSpec.medium) || document.visualSeries.styleSpec.medium,
            composition: strip(document.visualSeries.styleSpec.composition) || document.visualSeries.styleSpec.composition,
            background: strip(document.visualSeries.styleSpec.background) || document.visualSeries.styleSpec.background,
            lighting: strip(document.visualSeries.styleSpec.lighting) || document.visualSeries.styleSpec.lighting,
            palette: strip(document.visualSeries.styleSpec.palette) || document.visualSeries.styleSpec.palette,
            surfaceFeel: strip(document.visualSeries.styleSpec.surfaceFeel) || document.visualSeries.styleSpec.surfaceFeel,
            negativePrompts: document.visualSeries.styleSpec.negativePrompts.map((p) => strip(p) || p),
          },
        }
      : undefined,
  };
}

function enforceEvidencePolicy(cell: MapDocument["cells"][number]): MapDocument["cells"][number] {
  const proofExamples = dedupeConcreteExamplesByParent(cell.examples);
  const distinctParents = distinctConcreteParentCount(proofExamples);

  if (cell.status === "existing" && distinctParents < 2) {
    return {
      ...cell,
      status: distinctParents === 1 ? ("rare" as const) : ("gap" as const),
      badges: Array.from(new Set([...cell.badges, "Evidence adjusted"])),
      examples: proofExamples,
    };
  }

  if (cell.status === "rare" && distinctParents < 1) {
    return {
      ...cell,
      status: "gap" as const,
      badges: Array.from(new Set([...cell.badges, "Needs real example"])),
      examples: proofExamples,
    };
  }

  return {
    ...cell,
    examples: proofExamples.length ? proofExamples : cell.examples,
  };
}

function postProcessMapDocument(document: MapDocument, brief: NormalizedMapBrief) {
  const initialCells = Array.from(new Map(document.cells.map((cell) => [cell.id, cell])).values()).map(
    enforceEvidencePolicy,
  );
  pruneDuplicateAnchorsAcrossCells(initialCells);
  const dedupedCells = initialCells.map(enforceEvidencePolicy);

  const featuredExamples = backfillFeaturedExamples(dedupedCells, document.featuredExamples);

  const staged: MapDocument = {
    ...document,
    slug: slugify(document.slug || `${brief.domain}-map`),
    cells: dedupedCells,
    featuredExamples,
  };

  const stripped = stripTaxonomyFromGeneratedMap(staged);

  const cleanTitle = sanitizeMapTitle(stripped.title, brief);
  const cleanSummary = stripped.summary.trim() ? stripped.summary : document.summary.trim();
  const sanitizedSeoTitle = stripTaxonomyWords(stripped.seo?.title ?? "");
  const cleanSeoTitle =
    !sanitizedSeoTitle || sanitizedSeoTitle.length < 3 ? `${cleanTitle} | Lattice` : sanitizedSeoTitle;
  const cleanSeoDescription = stripTaxonomyWords(stripped.seo?.description ?? "");

  return attachVisualSeries({
    ...stripped,
    title: cleanTitle,
    summary: cleanSummary || document.summary.trim(),
    seo: {
      ...stripped.seo,
      title: cleanSeoTitle,
      description: cleanSeoDescription || stripped.seo?.description || "",
    },
  });
}

function getPrimaryDimensions(skeleton: MapSkeletonInput) {
  const xDimension = skeleton.dimensions.find((dimension) => dimension.key === skeleton.cellSchema.primaryX) ?? skeleton.dimensions[0];
  const yDimension = skeleton.dimensions.find((dimension) => dimension.key === skeleton.cellSchema.primaryY) ?? skeleton.dimensions[1];

  return { xDimension, yDimension };
}

function buildRequiredMatrix(skeleton: MapSkeletonInput) {
  const { xDimension, yDimension } = getPrimaryDimensions(skeleton);

  return xDimension.values.flatMap((xValue) =>
    yDimension.values.map((yValue) => ({
      id: `${slugify(xDimension.key)}-${slugify(xValue)}__${slugify(yDimension.key)}-${slugify(yValue)}`,
      coordinates: {
        [xDimension.key]: xValue,
        [yDimension.key]: yValue,
      },
    })),
  );
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function coordinateLookup(coordinates: Record<string, string>, key: string, label: string) {
  return (
    coordinates[key] ??
    coordinates[label] ??
    coordinates[slugify(key)] ??
    coordinates[slugify(label)] ??
    coordinates[titleCase(key)]
  );
}

function canonicalValue(value: string | undefined, values: string[]) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return (
    values.find((candidate) => candidate === trimmed) ??
    values.find((candidate) => slugify(candidate) === slugify(trimmed))
  );
}

function canonicalizeCoordinates(coordinates: Record<string, string>, skeleton: MapSkeletonInput) {
  return Object.fromEntries(
    skeleton.dimensions
      .map((dimension) => {
        const value = canonicalValue(coordinateLookup(coordinates, dimension.key, dimension.label), dimension.values);
        return value ? [dimension.key, value] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry)),
  );
}

function canonicalizeExample(example: MapCellsBatchInput["featuredExamples"][number], skeleton: MapSkeletonInput) {
  return {
    ...example,
    coordinates: canonicalizeCoordinates(example.coordinates, skeleton),
  };
}

function normalizeHitText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exampleVerificationTokens(example: MapExample): string[] {
  const parent = exampleParentIdentity(example);
  return parent
    .split(" ")
    .filter((token) => token.length >= 4)
    .slice(0, 3);
}

function exampleVerificationQuery(example: MapExample): string {
  const byIdentity = exampleImageSearchQuery(example);
  return byIdentity.trim() || example.name.trim();
}

function exampleIntrinsicVerificationStrength(example: MapExample): number {
  let score = exampleEvidenceScore(example);
  if (example.name.trim().split(/\s+/).length >= 2) {
    score += 1;
  }
  if (!looksLikePlaceholderBrand(example.brand)) {
    score += 1;
  }
  return score;
}

function anchorProbeTokenMatchCount(example: MapExample, result: ProbeResult): number {
  const verificationTokens = exampleVerificationTokens(example);
  if (verificationTokens.length === 0) {
    return 0;
  }

  return result.hits.reduce((best, hit) => {
    const haystack = normalizeHitText(`${hit.title ?? ""} ${hit.source ?? ""} ${hit.link}`);
    const matches = verificationTokens.filter((token) => haystack.includes(token)).length;
    return Math.max(best, matches);
  }, 0);
}

function shouldKeepExampleAfterProbe(example: MapExample, result: ProbeResult): {
  retained: boolean;
  externallyVerified: boolean;
} {
  const intrinsicStrength = exampleIntrinsicVerificationStrength(example);
  const suspicious =
    looksLikeModifiedAnchorName(example.name) ||
    looksLikePlaceholderBrand(example.brand) ||
    looksLikePlaceholderName(example.name);

  if (result.hits.length === 0) {
    return {
      retained: intrinsicStrength >= 8 && !suspicious,
      externallyVerified: false,
    };
  }

  const tokenMatches = anchorProbeTokenMatchCount(example, result);
  if (result.picturable || tokenMatches >= 2) {
    return { retained: true, externallyVerified: true };
  }

  if ((result.distinctSources >= 2 && tokenMatches >= 1) || (result.distinctSources >= 3 && !suspicious)) {
    return { retained: true, externallyVerified: true };
  }

  return {
    retained: intrinsicStrength >= 6 && result.distinctSources >= 1 && !suspicious,
    externallyVerified: false,
  };
}

function isRuleBasedFrontierExplanation(cell: Pick<MapCell, "status" | "explanation">): boolean {
  const text = cell.explanation.trim();
  if (text.length < 72) {
    return false;
  }
  if (cell.status === "impossible") {
    return RULE_BASED_IMPOSSIBLE_PATTERNS.some((re) => re.test(text));
  }
  return SUPPORTIVE_FRONTIER_PATTERNS.some((re) => re.test(text));
}

function frontierSupportScore(cell: MapCell): number {
  let score = 0;
  if (cell.badges.includes("Verified absent")) score += 4;
  if (cell.badges.includes("Visual evidence found")) score += 3;
  if (cell.examples.some(hasConcreteExample)) score += 2;
  if (isRuleBasedFrontierExplanation(cell)) score += 2;
  if (cell.badges.includes("Matrix repair")) score -= 2;
  if (cell.badges.includes("Thin evidence")) score -= 1;
  return score;
}

function frontierCellHasSupport(cell: MapCell): boolean {
  return frontierSupportScore(cell) >= 2;
}

function compareCoordinateSnapshots(a: Record<string, string>, b: Record<string, string>) {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function selectSubstantiatedCallouts(
  cells: MapCell[],
  statuses: MapCellStatus[],
): Array<{ label: string; explanation: string; coordinates: Record<string, string> }> {
  return cells
    .filter((cell) => statuses.includes(cell.status) && frontierCellHasSupport(cell))
    .sort((a, b) => {
      const supportDiff = frontierSupportScore(b) - frontierSupportScore(a);
      if (supportDiff !== 0) return supportDiff;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      const coordDiff = compareCoordinateSnapshots(a.coordinates, b.coordinates);
      if (coordDiff !== 0) return coordDiff;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 3)
    .map((cell) => ({
      label: cell.label,
      explanation: cell.explanation,
      coordinates: cell.coordinates,
    }));
}

export function refineFrontierEvidence(document: MapDocument): MapDocument {
  const cells = document.cells.map((cell) => {
    if (!["gap", "tension", "impossible"].includes(cell.status)) {
      return cell;
    }
    if (frontierCellHasSupport(cell)) {
      return cell;
    }
    return {
      ...cell,
      confidence: Math.min(cell.confidence, 0.42),
      badges: Array.from(new Set([...cell.badges, "Thin evidence"])),
    };
  });

  return {
    ...document,
    cells,
    notableGaps: selectSubstantiatedCallouts(cells, ["gap", "tension"]),
    impossibleCombos: selectSubstantiatedCallouts(cells, ["impossible", "tension"]),
  };
}

function coordinateKey(coordinates: Record<string, string>, xKey: string, yKey: string) {
  return `${coordinates[xKey]}|||${coordinates[yKey]}`;
}

function fallbackCallouts(cells: MapCellsBatchInput["cells"], statuses: Array<MapCellsBatchInput["cells"][number]["status"]>) {
  return cells
    .filter((cell) => statuses.includes(cell.status))
    .slice(0, 3)
    .map((cell) => ({
      label: cell.label,
      explanation: cell.explanation,
      coordinates: cell.coordinates,
    }));
}

type CanonicalizedBatchCoverage = {
  cells: MapCellsBatchInput["cells"];
  featuredExamples: MapCellsBatchInput["featuredExamples"];
  notableGaps: MapCellsBatchInput["notableGaps"];
  impossibleCombos: MapCellsBatchInput["impossibleCombos"];
  missingPairs: ReturnType<typeof buildRequiredMatrix>;
  invalidCellCount: number;
  duplicateCellCount: number;
};

function analyzeCellsBatchCoverage(
  batch: MapCellsBatchInput,
  skeleton: MapSkeletonInput,
  expectedPairs = buildRequiredMatrix(skeleton),
): CanonicalizedBatchCoverage {
  const { xDimension, yDimension } = getPrimaryDimensions(skeleton);
  const cellsByPair = new Map<string, MapCellsBatchInput["cells"][number]>();
  let invalidCellCount = 0;
  let duplicateCellCount = 0;

  for (const cell of batch.cells) {
    const examples = cell.examples.map((example) => canonicalizeExample(example, skeleton));
    const coordinates = canonicalizeCoordinates(cell.coordinates, skeleton);
    const xValue = coordinates[xDimension.key];
    const yValue = coordinates[yDimension.key];

    if (!xValue || !yValue) {
      invalidCellCount += 1;
      continue;
    }

    const key = coordinateKey(coordinates, xDimension.key, yDimension.key);
    if (cellsByPair.has(key)) {
      duplicateCellCount += 1;
      continue;
    }

    cellsByPair.set(key, {
      ...cell,
      coordinates,
      examples: examples.map((example) => ({
        ...example,
        coordinates: {
          ...coordinates,
          ...example.coordinates,
        },
      })),
    });
  }

  const orderedCells = expectedPairs
    .map((pair) => cellsByPair.get(coordinateKey(pair.coordinates, xDimension.key, yDimension.key)))
    .filter((cell): cell is MapCellsBatchInput["cells"][number] => Boolean(cell));
  const missingPairs = expectedPairs.filter(
    (pair) => !cellsByPair.has(coordinateKey(pair.coordinates, xDimension.key, yDimension.key)),
  );

  const matrixKeys = new Set(
    orderedCells.map((cell) => coordinateKey(cell.coordinates, xDimension.key, yDimension.key)),
  );
  const cellsByMatrixKey = new Map(
    orderedCells.map((cell) => [coordinateKey(cell.coordinates, xDimension.key, yDimension.key), cell]),
  );
  const canonicalizeCallouts = (callouts: MapCellsBatchInput["notableGaps"]) =>
    callouts
      .map((callout) => {
        const coordinates = canonicalizeCoordinates(callout.coordinates, skeleton);
        const key = coordinateKey(coordinates, xDimension.key, yDimension.key);
        const cell = cellsByMatrixKey.get(key);

        if (!cell || !matrixKeys.has(key)) {
          return null;
        }

        return {
          ...callout,
          coordinates: cell.coordinates,
        };
      })
      .filter((callout): callout is MapCellsBatchInput["notableGaps"][number] => Boolean(callout));
  const notableGaps = canonicalizeCallouts(batch.notableGaps);
  const impossibleCombos = canonicalizeCallouts(batch.impossibleCombos);

  return {
    cells: orderedCells,
    featuredExamples: batch.featuredExamples.map((example) => canonicalizeExample(example, skeleton)),
    notableGaps: notableGaps.length ? notableGaps : fallbackCallouts(orderedCells, ["gap", "tension"]),
    impossibleCombos: impossibleCombos.length ? impossibleCombos : fallbackCallouts(orderedCells, ["impossible", "tension"]),
    missingPairs,
    invalidCellCount,
    duplicateCellCount,
  };
}

/**
 * Publish only when the map document satisfies structural/evidence heuristics (coverage, gaps,
 * concrete examples per cell status). Numeric brief or post-process scores are not used.
 */
export function canAutoPublish(document: MapDocument) {
  const hasEnoughExamples = document.featuredExamples.length >= 2;
  const hasCoverage = document.cells.length >= 9;
  const hasInterestingFindings = document.notableGaps.length >= 1 || document.impossibleCombos.length >= 1;
  const cellsMeetEvidencePolicy = document.cells.every((cell) => {
    const proofs = dedupeConcreteExamplesByParent(cell.examples);
    if (cell.status === "existing") {
      return distinctConcreteParentCount(proofs) >= 2;
    }
    if (cell.status === "rare") {
      return distinctConcreteParentCount(proofs) >= 1;
    }
    return true;
  });

  return hasEnoughExamples && hasCoverage && hasInterestingFindings && cellsMeetEvidencePolicy;
}

export async function normalizeMapBrief(
  briefInput: MapBriefInput,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
): Promise<NormalizedMapBrief> {
  const brief = mapBriefSchema.parse(briefInput);
  emitStep(sink, "normalize_brief", "start");
  const instructions = `
You are the intake editor for Lattice, a tool that builds gap-first combinatorial maps (any subject matter) so a user can see unimagined variations at a glance.
Return JSON only. No markdown.

Your job:
- The user message may name a terse topic or a rich brief; preserve every literal constraint supplied.
- Judge whether axes can expose legible distinctions, contradictory combinations, thin regions, and hard stops—without prescribing any particular industry motif.
- You must emit exactly two dimensions (distinct, concrete, orthogonal). Do not add a third — the map renders as a clean 2D grid of these two axes only.
- Each axis MUST be visualizable: value labels should be concrete, picturable properties—materials, physical form, setting, process stage, format, era, scale—things a user could sketch, photograph, or image-search. Reject scalar "vibes" axes (cheap↔premium, simple↔complex, good↔bad), sentiment/mood continuums, or abstract scores with no scene attached.
- Reject INTERNAL/INVISIBLE axes that cannot be photographed at the chosen viewpoint (e.g., for hardware: "boiler architecture", "chipset", "firmware tier"; for food: "grain protein percentage", "pH"; for fashion: "fiber denier"). If the user supplied such an axis in candidateDimensions, REWRITE it into the corresponding visible cue (e.g., "boiler architecture" → "front-panel gauge & group-head silhouette"; "chipset" → "case footprint & port cluster"; "fiber denier" → "weave pattern & light scatter"). Preserve the user's intent but only emit axes the camera can actually see.
- Whenever you rewrite a user-supplied axis into its outward visible cue, append a one-sentence note to "guidance" naming the original concept and the picturable cue you chose, so the user can confirm the substitution preserved their intent. Format: "Rewrote '<original>' to '<picturable>' so the axis is visible in a single photo."
- Favor axis pairs that naturally produce SPARSE quadrants worth flagging as gaps, tensions, or rule-blocked impossibles—not dense "everything exists" grids where every crossing is crowded.
- Reject vibes-only palettes, leaderboard aesthetics, unstructured mashups without compositional rules, and unfalsifiable lore.
- Keep keys lowercase kebab-case or snake-safe labels.
- Generate the "combines" string tying together which properties the lattice intersects.
- Treat candidateDimensions, mustIncludeExamples, mustAvoid, constraint notes, and extraContext as authoritative user guardrails—not suggestions.
- Judge axis visualizability and whether missing crossings are meaningful (gaps, tensions, impossibles)—not dense grids where every cell is crowded.
- FORBIDDEN WORDS in any user-visible field (topic, combines, domain, topicFamily, dimension labels/descriptions, guidance): the words "taxonomy", "taxonomic", and "taxonomical". Use plain words like "map", "structure", "organization", "classification scheme", or just the domain name instead.

Required output shape:
{
  "topic": string,
  "combines": string,
  "candidateDimensions": string[],
  "inferDimensions": boolean,
  "audience": string,
  "tone": string,
  "constraints"?: string,
  "mustIncludeExamples": string[],
  "mustAvoid": string[],
  "extraContext"?: string,
  "domain": string,
  "topicFamily": string,
  "dimensions": [{"key": string, "label": string, "description": string}],
  "accepted": boolean,
  "guidance": string[]
}
`;

  const response = await runStructuredModel<NormalizedMapBriefInput>({
    model: appConfig.openRouter.model,
    instructions,
    input: JSON.stringify(brief),
    schemaName: "normalized_map_brief",
    jsonSchema: normalizedMapBriefJsonSchema,
    step: "normalize_brief",
    sink,
    collector,
  });

  if (!response) {
    emitStep(sink, "normalize_brief", "end", "heuristic fallback");
    collector?.appendStage({
      stageId: "normalize_brief_heuristic",
      durationMs: 0,
      extras: { reason: "empty_response" },
    });
    return heuristicNormalizeBrief(brief);
  }

  const parsed = normalizedMapBriefSchema.safeParse(response);
  if (!parsed.success) {
    emitStep(sink, "normalize_brief", "end", "heuristic fallback");
    collector?.appendStage({
      stageId: "normalize_brief_heuristic",
      durationMs: 0,
      extras: { reason: "parse_failed" },
    });
    return heuristicNormalizeBrief(brief);
  }

  emitStep(sink, "normalize_brief", "end");
  return parsed.data;
}

type SkeletonValueProbeResult = {
  unpicturableValues: Array<{ axis: string; value: string }>;
  totalProbed: number;
  durationMs: number;
};

async function probeSkeletonValuesForPicturability(
  skeleton: MapSkeletonInput,
  brief: NormalizedMapBrief,
  budget: ProbeBudget,
): Promise<SkeletonValueProbeResult> {
  const out: SkeletonValueProbeResult = { unpicturableValues: [], totalProbed: 0, durationMs: 0 };
  if (!getSerpApiKey() || budget.remaining() === 0) {
    return out;
  }

  type Job = { axis: string; value: string };
  const jobs: Job[] = [];
  for (const dimension of skeleton.dimensions) {
    for (const value of dimension.values) {
      jobs.push({ axis: dimension.label, value });
    }
  }

  const t0 = Date.now();
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { axis, value } = jobs[next++];
      if (budget.remaining() === 0) return;
      const query = `${brief.topic} ${axis} ${value}`.trim();
      const result = await budget.probe(query);
      if (result.skipped === "budget" || result.skipped === "no-key") return;
      // `invalid-query` here means the query failed normalization; treat as
      // unscored rather than counting it against picturability.
      if (result.skipped === "invalid-query") continue;
      out.totalProbed += 1;
      if (!result.picturable) {
        out.unpicturableValues.push({ axis, value });
      }
    }
  }

  const concurrency = Math.min(PROBE_DEFAULT_CONCURRENCY, jobs.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  out.durationMs = Date.now() - t0;
  return out;
}

function buildSkeletonRemediation(unpicturable: Array<{ axis: string; value: string }>): string {
  if (!unpicturable.length) return "";
  const lines = unpicturable
    .slice(0, 12)
    .map((entry) => `  - "${entry.value}" on axis "${entry.axis}"`)
    .join("\n");
  return `\n\nREMEDIATION (required): A live image search returned no thumbnails for these axis values, so they are not picturable in the chosen domain context:\n${lines}\nReplace each listed value with a different concrete, picturable cue (a material, form factor, setting, process stage, era cue, or surface treatment) that yields recognizable image results within the topic. Keep the axis labels intact unless an axis is itself unsalvageable. Do not silently delete values—rename them.`;
}

async function modelGenerateMapSkeleton(
  brief: NormalizedMapBrief,
  research: ResearchContext,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
  probeBudget?: ProbeBudget,
) {
  const researchSection = formatResearchForPrompt(research, "skeleton");
  const groundingState = getResearchGroundingState(research);
  const emptyResearchNotice = groundingState === "none"
    ? `\nWARNING: No grounded research summary was retrieved; axes may be speculative and ungrounded—still structure the map coherently, but avoid fake specificity.\n`
    : groundingState === "unsourced"
      ? `\nWARNING: Research notes were produced without retrieved citations; treat them as weak brainstorming, not as evidence. Stay conservative and avoid unsupported specificity.\n`
      : "";

  const instructions = `
You are an expert systems analyst specializing in orthogonal 2-axis combinatorial maps.
Your job is to build the structural SKELETON of a gap-first combinatorial map for whatever domain the normalized brief declares.
Do NOT generate the cells. You MUST emit every structural field:
title, slug, summary, intro, domain, topicFamily, dimensions, cellSchema, constraints, renderingHints, and seo.
${researchSection}${emptyResearchNotice}
Skeleton quality targets:
- FORBIDDEN WORDS in every user-visible string (title, summary, intro, domain, topicFamily, dimension labels/descriptions, value labels, constraint labels/explanations, seo.title, seo.description): the words "taxonomy", "taxonomic", and "taxonomical". Use plain words like "map", "guide", "structure", "classification scheme", or just the domain name. Internal constraint kinds may stay as-is — this rule applies to human-readable copy only.
- Value labels remain short tokens (no explanatory sentences appended to axes).
- Value labels are NOUN-LIKE, scene-stable, and picturable—concrete materials, formats, settings, process stages, or form factors a human could sketch or image-search. Avoid long clauses, scalar adjectives, mood words, or score-like qualifiers.
- Each axis VALUE must read at the viewing distance the brief implies. If a candidate value is hidden inside the object (internal boiler, chipset, hidden fiber spec), replace it with its outward photographic cue (front-panel gauge cluster, case footprint, surface scatter pattern). Never declare an internal-only attribute as an axis tick.
- Quantitative ticks (counts, percentages, folds, durations) stay within domain-credible bands—prefer trade-standard bands over sci-fi extremes invented to fill axes.
- Emit exactly two dimensions; each exposes 3–5 concrete values. Do not add a third axis — the map renders as a clean 2D grid of these two axes only.
- Do not concatenate unrelated categories behind slashes purely to inflate counts—split them or fold into descriptions.
- Favor axis pairs where MISSING crossings are meaningful: downstream, empty cells are shown to the user as gaps/tensions/impossibles so they can see unimagined variations. Bland axes that trivially fill every slot are a failure mode.
- If the user-supplied candidateDimensions reference an INTERNAL or hidden property (e.g., "boiler architecture", "chipset", "hydration percentage", "fiber denier"), REPLACE it with the picturable cue that signals it from the camera's viewpoint. Preserve the user's underlying distinction, but only ship axes a viewer can read off a single hero photo.
- When you substitute an axis label or value to make it picturable, mention the substitution in the SEO description in plain language (e.g., "renames hydration to crumb-tightness, the visible cue").
- When research contradicts headline intuitions about labels, reconcile by privileging reproducible nomenclature from the pack while respecting user intent spelled out in constraints.
If research is vacant, stay conservative: orthogonal axes anchored in the brief wording, plainly labeled regimes.
${universalMapContract}
`;

  emitStep(sink, "skeleton", "start");

  async function callOnce(remediation: string): Promise<MapSkeletonInput | null> {
    const response = await runStructuredModel<MapSkeletonInput>({
      model: appConfig.openRouter.model,
      instructions: instructions + remediation,
      input: JSON.stringify(brief),
      schemaName: "map_skeleton",
      jsonSchema: mapSkeletonJsonSchema,
      step: "skeleton",
      sink,
      collector,
    });

    if (response == null || typeof response !== "object") {
      return null;
    }

    const repairedResponse = repairSkeletonCandidate(response);
    const parsed = mapSkeletonSchema.safeParse(repairedResponse);
    if (!parsed.success) {
      console.error("Failed to parse map skeleton:", JSON.stringify(parsed.error.issues, null, 2));
      const r = repairedResponse as
        | {
            dimensions?: Array<{ key?: string; values?: unknown[] }>;
            renderingHints?: { gradient?: unknown[] };
          }
        | null;
      if (r?.dimensions) {
        r.dimensions.forEach((d, i) => {
          console.error(`  dim[${i}] "${d.key}": ${d.values?.length} values`);
        });
      }
      if (r?.renderingHints) {
        console.error(`  renderingHints.gradient length: ${r.renderingHints?.gradient?.length}`);
      }
      return null;
    }
    return parsed.data;
  }

  const first = await callOnce("");
  if (!first) {
    emitStep(sink, "skeleton", "end", "no response or parse failed");
    return null;
  }

  // Visual probe gate. If at least half of probed values are unpicturable,
  // retry once with a remediation listing the bad values. Skipped silently
  // if SERPAPI is unconfigured or budget is exhausted (probe returns empty).
  if (probeBudget && probeBudget.remaining() > 0 && getSerpApiKey()) {
    const probe = await probeSkeletonValuesForPicturability(first, brief, probeBudget);
    if (probe.totalProbed > 0) {
      const failureRatio = probe.unpicturableValues.length / probe.totalProbed;
      const tooManyUnpicturable = failureRatio >= 0.5 && probe.unpicturableValues.length >= 2;
      if (tooManyUnpicturable) {
        const remediation = buildSkeletonRemediation(probe.unpicturableValues);
        const second = await callOnce(remediation);
        if (second) {
          collector?.appendStage({
            stageId: "skeleton_visual_probe_retry",
            durationMs: probe.durationMs,
            externalCallCount: probe.totalProbed,
            extras: {
              unpicturableValues: probe.unpicturableValues,
              failureRatio,
              retried: true,
            },
          });
          emitStep(sink, "skeleton", "end");
          return second;
        }
      } else if (probe.unpicturableValues.length > 0) {
        collector?.appendStage({
          stageId: "skeleton_visual_probe",
          durationMs: probe.durationMs,
          externalCallCount: probe.totalProbed,
          extras: {
            unpicturableValues: probe.unpicturableValues,
            failureRatio,
            retried: false,
          },
        });
      }
    }
  }

  emitStep(sink, "skeleton", "end");
  return first;
}

function dedupeExamples(examples: MapCellsBatchInput["featuredExamples"]) {
  return Array.from(
    new Map(
      examples
        .filter((example) => example.name)
        .map((example) => [example.name.toLowerCase(), example]),
    ).values(),
  );
}

function backfillFeaturedExamples(cells: MapDocument["cells"], current: MapExample[]): MapExample[] {
  const fromCells = cells.flatMap((cell) => cell.examples.filter(hasConcreteExample));
  return dedupeConcreteExamplesByParent([...current.filter(hasConcreteExample), ...fromCells]).slice(0, 8);
}

function mergeCellsBatches(batches: MapCellsBatchInput[]): MapCellsBatchInput {
  const cells = batches.flatMap((batch) => batch.cells);
  const cellExamples = cells.flatMap((cell) => cell.examples);
  const featuredExamples = dedupeExamples([
    ...batches.flatMap((batch) => batch.featuredExamples),
    ...cellExamples,
  ]).slice(0, 8);
  const notableGaps = batches.flatMap((batch) => batch.notableGaps);
  const impossibleCombos = batches.flatMap((batch) => batch.impossibleCombos);

  return {
    cells,
    featuredExamples,
    notableGaps: notableGaps.length ? notableGaps : fallbackCallouts(cells, ["gap", "tension"]),
    impossibleCombos: impossibleCombos.length ? impossibleCombos : fallbackCallouts(cells, ["impossible", "tension"]),
  };
}

function repairSkeletonCandidate(response: unknown) {
  if (!response || typeof response !== "object") {
    return response;
  }

  const candidate = response as {
    dimensions?: Array<{ values?: string[] }>;
    renderingHints?: { gradient?: unknown };
  };

  let next = response as Record<string, unknown>;

  if (Array.isArray(candidate.dimensions)) {
    next = {
      ...next,
      dimensions: candidate.dimensions.map((dimension) =>
        Array.isArray(dimension.values) && dimension.values.length > 8
          ? { ...dimension, values: dimension.values.slice(0, 8) }
          : dimension,
      ),
    };
  }

  if (Array.isArray(candidate.renderingHints?.gradient) && candidate.renderingHints.gradient.length > 4) {
    next = {
      ...next,
      renderingHints: {
        ...candidate.renderingHints,
        gradient: candidate.renderingHints.gradient.slice(0, 4),
      },
    };
  }

  return next;
}

function synthesizeGapBatch(
  skeleton: MapSkeletonInput,
  batchRequiredMatrix: ReturnType<typeof buildRequiredMatrix>,
): MapCellsBatchInput {
  const { xDimension, yDimension } = getPrimaryDimensions(skeleton);

  const cells = batchRequiredMatrix.map((pair) => {
    const coordinates: Record<string, string> = { ...pair.coordinates };
    const label = `${coordinates[xDimension.key]} × ${coordinates[yDimension.key]}`;
    return {
      id: pair.id,
      coordinates,
      label,
      status: "gap" as const,
      explanation:
        "This matrix slice did not validate after generation (missing or mismatched coordinates). It is marked as a frontier until a pass can anchor it with named instances.",
      confidence: 0.55,
      badges: ["Matrix repair"],
      examples: [],
    };
  });

  return {
    cells,
    featuredExamples: [],
    notableGaps: fallbackCallouts(cells, ["gap", "tension"]),
    impossibleCombos: fallbackCallouts(cells, ["impossible", "tension"]),
  };
}

async function mapPool<T>(length: number, concurrency: number, worker: (index: number) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array(length);
  let nextIndex = 0;
  async function runner() {
    while (true) {
      const i = nextIndex++;
      if (i >= length) {
        return;
      }
      results[i] = await worker(i);
    }
  }
  const runners = Math.min(concurrency, Math.max(1, length));
  await Promise.all(Array.from({ length: runners }, () => runner()));
  return results;
}

async function modelGenerateMapCells(
  skeleton: MapSkeletonInput,
  brief: NormalizedMapBrief,
  research: ResearchContext,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
  onBatchFlushed?: (
    batch: MapCellsBatchInput,
    batchIndex: number,
    totalBatches: number,
  ) => void | Promise<void>,
) {
  // PERF NOTE (see plans/do-an-overall-evaluation-purrfect-whistle.md, P0.4):
  // `instructions` below — including `researchSection` — is computed once per
  // run but sent verbatim with every cell batch (typically 4–8 batches). On a
  // grounded run with a long research pack, that's >50% of the cells-phase
  // token bill repeated per batch. The proper fix is provider-aware prompt
  // caching: split the request into a stable system prefix (research +
  // brief + skeleton + universalMapContract) with `cache_control: ephemeral`
  // and a per-batch user payload carrying just `requiredMatrix`. Anthropic
  // caches it; Gemini needs the separate context-caching API. Deferred until
  // we add a per-model caching strategy in lib/openrouter.ts.
  const researchSection = formatResearchForPrompt(research, "cells");
  const groundingState = getResearchGroundingState(research);
  const researchNotice =
    groundingState === "none"
      ? `\nWARNING: No grounded research summary was retrieved; prefer conservative labels, avoid unsupported specificity, and downgrade weakly evidenced cells.\n`
      : groundingState === "unsourced"
        ? `\nWARNING: Research notes were produced without retrieved citations; use them only as weak brainstorming, not evidence. Prefer conservative labels and downgrade unsupported specificity.\n`
        : "";
  const requiredMatrix = buildRequiredMatrix(skeleton);
  const requiredMatrixBatches = chunkItems(requiredMatrix, 8);
  const batchCount = requiredMatrixBatches.length;
  const concurrency = Math.min(appConfig.generation.cellsBatchConcurrency, batchCount);

  const instructions = `
You are an expert systems analyst shaping orthogonal combinatorial maps across heterogeneous domains.
You have been given a Map Skeleton containing dimensions and constraints.
Your job is to generate one batch of CELLS for this matrix, evaluating each combination deeply.
${researchSection}${researchNotice}
Quality bar:
- FORBIDDEN WORDS in every user-visible string (cell labels, cell explanations, badges, example names/descriptions/evidenceNote, notableGaps/impossibleCombos labels and explanations): the words "taxonomy", "taxonomic", and "taxonomical". Use "map", "structure", "classification", or rephrase.
- Generate the exact cells in requiredMatrix. Every listed x/y pair must have one cell—no missing pairs and no extras.
- For each entry in THIS batch's requiredMatrix: emit exactly ONE cell whose "coordinates" object is IDENTICAL to that entry's coordinates (same property keys AND the same literal value strings). Copy verbatim; rewritten tick strings fail validation offline.
- When referencing counts, percentages, folds, durations, etc., align with domain-credible regimes—don't invent astronomically inflated numbers purely to sensationalize corners.
- Cell and example coordinates MUST use dimension keys, not display labels.
- Every cell and example coordinates object must include exactly the primary x key and primary y key from the skeleton — no additional coordinate keys.
- Evaluate each combination carefully. Is it existing, rare, gap, tension, or impossible?
- "Impossible" means the combination breaks explicit rules named in skeleton constraints or unmistakable axioms shared by authoritative references.
- "Tension" means the pairing survives only as guarded experiment/adaptation/straddle but clashes with canonical usage.
- "Gap" means plausible but underdeveloped, not nonsense. For gap cells, the explanation must describe what WOULD need to exist to fill it, in concrete, picturable terms (material, form factor, setting, process step)—so the reader can imagine or image-search the missing thing.
- Cell labels are SCENE LABELS, not status tags. NEVER prefix a label with the status word ("Gap …", "Rare …", "Tension …", "Impossible …", "Common …", "Canonical …"). NEVER use the literal coordinate values as the label ("Reverse-Tanto Full-Bolster"). Instead, name the picturable thing a single hero photo would show — concrete materials, form factor, setting (e.g., "Hearth-charred slack-dough flatbread", "Saturated dual-boiler chrome cube", "Hidden-tang gyuto with steel cap"). Empty cells (gap/tension/impossible) still get vivid scene labels describing the missing/forbidden thing.
- EVERY example names an identifiable anchor; pick whichever hook suits the ontology (institutional operator, genealogical lineage, catalogued artifact identifier, sanctioned movement name)—never unnamed vibe words masquerading as examples.
- ANTI-FABRICATION: never invent placeholder anchors with brand names like "Generic", "Industry Standard", "Custom", "Concept", "Prototype", "Hypothetical", "Specialized X Footwear". If you cannot cite a real named instance with a real maker for a cell, downgrade the cell from existing/rare to gap and write the gap explanation. Better an empty gap than a fake anchor.
- ONE PARENT PER CELL: each parent product/specimen/work appears in at most ONE cell. Do not split product family variants ("X PDO" + "X non-PDO", "Vaporfly 3" + "Vaporfly 4") across cells just to fill quadrants—pick the cell that best matches the family's archetype and use a different anchor elsewhere.
- Mark a cell "existing" only when ≥2 verifiable proofs exist by contract definition; exactly one ⇒ "rare"; none ⇒ gap/tension/impossible unless explanation states why no anchor can exist even in principle.
- For every "existing" cell the examples array MUST contain ≥2 entries before you finish; each entry must pass the verifier (name plus brand, year, evidenceNote≥12, or description≥48). Single-example "existing" cells are invalid output.
- For "existing"/"rare", prefer ENTITY LEDGER overlaps; mismatches downgrade status rather than inventing replacements.
- Evidence notes articulate why the cited anchor occupies the quadrant, never paraphrase titles.
- Maintain status diversity—inflate neither "existing" nor "impossible" beyond what evidence supports.
- notableGaps and impossibleCombos should cite coordinates already present among generated cells.

${universalMapContract}

REFERENCE SHAPE ONLY (reuse your skeleton.dimension keys—not these literal identifiers):
[{"id":"illustration-positive","coordinates":{"axis_one":"Anchored","axis_two":"Controlled"},"label":"Worked cell","status":"existing","confidence":0.86,"examples":[{"name":"Named Reference A","description":"Brief role","coordinates":{"axis_one":"Anchored","axis_two":"Controlled"},"brand":"ResponsibleOrg","year":"2019","status":"existing","confidence":0.9,"evidenceNote":"Anchors quadrant with two independently cited referents"},{"name":"Named Reference B",...}]} , {"id":"illustration-blocked","coordinates":{"axis_one":"Pinned","axis_two":"Inverted"},"label":"Forbidden crossing","status":"impossible","explanation":"State which rule forbids coexistence","examples":[]}]
`;

  const eventBuffers: GenerationTraceEvent[][] = sink
    ? Array.from({ length: batchCount }, () => [])
    : [];
  let nextFlushBatch = 0;
  const filled: boolean[] = new Array(batchCount).fill(false);
  const slottedBatches: Array<MapCellsBatchInput | null> = new Array(batchCount).fill(null);
  let flushChain = Promise.resolve();

  function scheduleOrderedFlush() {
    if (!sink && !onBatchFlushed) {
      return;
    }
    flushChain = flushChain.then(async () => {
      while (nextFlushBatch < batchCount && filled[nextFlushBatch]) {
        if (sink) {
          for (const ev of eventBuffers[nextFlushBatch]) {
            sink(ev);
          }
        }
        const batchData = slottedBatches[nextFlushBatch];
        if (onBatchFlushed && batchData) {
          try {
            await onBatchFlushed(batchData, nextFlushBatch, batchCount);
          } catch (err) {
            console.error(`[modelGenerateMapCells] onBatchFlushed batch ${nextFlushBatch} failed:`, err);
          }
        }
        nextFlushBatch++;
      }
    });
  }

  const cellsWall0 = Date.now();
  let structuredExternalCalls = 0;
  let parseRetryTotal = 0;
  let fallbackSyntheticSlices = 0;
  let parseFailureCount = 0;
  let coordinateMismatchCount = 0;
  let repairAttemptCount = 0;
  let repairRecoveredPairCount = 0;
  let unresolvedPairCount = 0;

  const batches = await mapPool(batchCount, concurrency, async (index) => {
    const batchRequiredMatrix = requiredMatrixBatches[index];
    const captureSink: GenerationStreamSink | undefined = sink
      ? (ev) => {
          eventBuffers[index].push(ev);
        }
      : undefined;

    emitStep(captureSink, "cells", "start", `batch ${index + 1}/${batchCount}`);
    let baseCoverage: CanonicalizedBatchCoverage | null = null;
    let parsedBatch: MapCellsBatchInput | null = null;
    let parseAttemptsUsed = 0;

    for (let attempt = 0; attempt < 2 && !parsedBatch; attempt++) {
      structuredExternalCalls++;
      parseAttemptsUsed++;
      const response = await runStructuredModel<MapCellsBatchInput>({
        model: appConfig.openRouter.model,
        instructions,
        input: JSON.stringify({
          brief,
          skeleton,
          batch: {
            index: index + 1,
            total: batchCount,
            attempt: attempt + 1,
          },
          requiredMatrix: batchRequiredMatrix,
        }),
        schemaName: "map_cells",
        jsonSchema: mapCellsJsonSchema,
        step: `cells_batch_${index + 1}`,
        sink: captureSink,
        collector,
        flushMetrics: false,
      });

      const parsed = mapCellsBatchSchema.safeParse(response);
      if (!parsed.success) {
        parseFailureCount += 1;
        console.error("Failed to parse map cells batch:", parsed.error.issues);
        continue;
      }

      parsedBatch = parsed.data;
      baseCoverage = analyzeCellsBatchCoverage(parsed.data, skeleton, batchRequiredMatrix);
    }

    if (parseAttemptsUsed > 1) {
      parseRetryTotal += parseAttemptsUsed - 1;
    }

    if (!baseCoverage) {
      fallbackSyntheticSlices += 1;
      console.warn(`Map cells batch ${index + 1}: using gap fallbacks for this slice.`);
      const fallback = synthesizeGapBatch(skeleton, batchRequiredMatrix);
      emitStep(captureSink, "cells", "end", `batch ${index + 1}/${batchCount}`);
      slottedBatches[index] = fallback;
      filled[index] = true;
      scheduleOrderedFlush();
      return fallback;
    }

    let finalBatch: MapCellsBatchInput;
    if (baseCoverage.missingPairs.length === 0) {
      finalBatch = {
        cells: baseCoverage.cells,
        featuredExamples: baseCoverage.featuredExamples,
        notableGaps: baseCoverage.notableGaps,
        impossibleCombos: baseCoverage.impossibleCombos,
      };
    } else {
      coordinateMismatchCount += baseCoverage.missingPairs.length;
      console.warn(
        `Map cells batch ${index + 1}: repairing ${baseCoverage.missingPairs.length} missing matrix pairs.`,
      );
      repairAttemptCount += 1;
      structuredExternalCalls++;
      const repairInstructions = `${instructions}

REPAIR MODE:
- A previous batch produced valid cells for some coordinates but missed others.
- Generate ONLY the cells in this repair batch's requiredMatrix.
- Do not repeat already-covered coordinates.
- Keep labels, statuses, and examples as concrete and domain-specific as the main pass.`;
      const repairResponse = await runStructuredModel<MapCellsBatchInput>({
        model: appConfig.openRouter.model,
        instructions: repairInstructions,
        input: JSON.stringify({
          brief,
          skeleton,
          batch: {
            index: index + 1,
            total: batchCount,
            attempt: 1,
            mode: "repair",
          },
          requiredMatrix: baseCoverage.missingPairs,
        }),
        schemaName: "map_cells",
        jsonSchema: mapCellsJsonSchema,
        step: `cells_batch_${index + 1}_repair`,
        sink: captureSink,
        collector,
        flushMetrics: false,
      });

      const repairParsed = mapCellsBatchSchema.safeParse(repairResponse);
      let mergedCoverage = baseCoverage;
      if (repairParsed.success) {
        const repairCoverage = analyzeCellsBatchCoverage(
          repairParsed.data,
          skeleton,
          baseCoverage.missingPairs,
        );
        repairRecoveredPairCount +=
          baseCoverage.missingPairs.length - repairCoverage.missingPairs.length;
        mergedCoverage = analyzeCellsBatchCoverage(
          {
            cells: [...baseCoverage.cells, ...repairCoverage.cells],
            featuredExamples: [...baseCoverage.featuredExamples, ...repairCoverage.featuredExamples],
            notableGaps: [...baseCoverage.notableGaps, ...repairCoverage.notableGaps],
            impossibleCombos: [...baseCoverage.impossibleCombos, ...repairCoverage.impossibleCombos],
          },
          skeleton,
          batchRequiredMatrix,
        );
      } else {
        parseFailureCount += 1;
        console.error("Failed to parse map cells repair batch:", repairParsed.error.issues);
      }

      if (mergedCoverage.missingPairs.length > 0) {
        unresolvedPairCount += mergedCoverage.missingPairs.length;
        const fallback = synthesizeGapBatch(skeleton, mergedCoverage.missingPairs);
        mergedCoverage = analyzeCellsBatchCoverage(
          {
            cells: [...mergedCoverage.cells, ...fallback.cells],
            featuredExamples: [...mergedCoverage.featuredExamples, ...fallback.featuredExamples],
            notableGaps: [...mergedCoverage.notableGaps, ...fallback.notableGaps],
            impossibleCombos: [...mergedCoverage.impossibleCombos, ...fallback.impossibleCombos],
          },
          skeleton,
          batchRequiredMatrix,
        );
      }

      finalBatch = {
        cells: mergedCoverage.cells,
        featuredExamples: mergedCoverage.featuredExamples,
        notableGaps: mergedCoverage.notableGaps,
        impossibleCombos: mergedCoverage.impossibleCombos,
      };
    }

    emitStep(captureSink, "cells", "end", `batch ${index + 1}/${batchCount}`);
    slottedBatches[index] = finalBatch;
    filled[index] = true;
    scheduleOrderedFlush();
    return finalBatch;
  });

  await flushChain;
  collector?.addCellsAggregate({
    durationWallMs: Date.now() - cellsWall0,
    batchCount,
    retryTotal: parseRetryTotal,
    fallbackSyntheticBatchCount: fallbackSyntheticSlices,
    externalCalls: structuredExternalCalls,
    model: appConfig.openRouter.model,
    extras: {
      parseFailureCount,
      coordinateMismatchCount,
      repairAttemptCount,
      repairRecoveredPairCount,
      unresolvedPairCount,
    },
  });
  return mergeCellsBatches(batches);
}

export async function generateMapDocument(
  brief: NormalizedMapBrief,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
  options?: { mapId?: string; probeBudget?: ProbeBudget },
): Promise<MapDocument | null> {
  const liveId = options?.mapId;
  const probeBudget = options?.probeBudget;

  // Step 1: Fetch live research context via OpenRouter web plugin
  const research = await fetchResearchContext(brief, undefined, sink, collector);
  if (research.sources.length > 0) {
    console.log(`Research grounded via: ${research.sources.slice(0, 3).join(", ")}`);
  }

  // Step 2: Generate map skeleton using research-grounded axes (with optional visual probe gate)
  const skeleton = await modelGenerateMapSkeleton(brief, research, sink, collector, probeBudget);
  if (!skeleton) {
    return null;
  }

  if (liveId) {
    // First substantive patch: dimensions, cellSchema, summary, intro, etc.
    // The grid in `live` mode lays out as soon as dimensions populate.
    await applyMapPatch({
      mapId: liveId,
      mutate: (current) => ({
        ...current,
        title: skeleton.title || current.title,
        slug: current.slug,
        summary: skeleton.summary || current.summary,
        intro: skeleton.intro || current.intro,
        domain: skeleton.domain || current.domain,
        topicFamily: skeleton.topicFamily || current.topicFamily,
        dimensions: skeleton.dimensions,
        cellSchema: skeleton.cellSchema,
        constraints: skeleton.constraints ?? current.constraints,
        renderingHints: skeleton.renderingHints ?? current.renderingHints,
        visualSeries: skeleton.visualSeries ?? current.visualSeries,
        seo: skeleton.seo ?? current.seo,
      }),
    });
  }

  const pendingLiveBatches: MapCellsBatchInput[] = [];
  const liveCheckpointEvery = 2;

  const cellsBatch = await modelGenerateMapCells(
    skeleton,
    brief,
    research,
    sink,
    collector,
    liveId
      ? async (batch, batchIndex, totalBatches) => {
          pendingLiveBatches.push(batch);
          const shouldFlush =
            batchIndex === totalBatches - 1 ||
            pendingLiveBatches.length >= liveCheckpointEvery;
          if (!shouldFlush) {
            return;
          }

          const flushed = pendingLiveBatches.splice(0, pendingLiveBatches.length);
          const merged = mergeCellsBatches(flushed);
          await applyMapPatch({
            mapId: liveId,
            mutate: (current) => {
              const seenIds = new Set(current.cells.map((c) => c.id));
              const newCells = merged.cells.filter((c) => !seenIds.has(c.id));
              return {
                ...current,
                cells: [...current.cells, ...newCells],
                featuredExamples: dedupeExamples([
                  ...current.featuredExamples,
                  ...merged.featuredExamples,
                ]).slice(0, 8),
                notableGaps: [...current.notableGaps, ...merged.notableGaps],
                impossibleCombos: [...current.impossibleCombos, ...merged.impossibleCombos],
              };
            },
          });
        }
      : undefined,
  );

  const document: MapDocument = {
    ...skeleton,
    cells: cellsBatch.cells,
    featuredExamples: cellsBatch.featuredExamples,
    notableGaps: cellsBatch.notableGaps,
    impossibleCombos: cellsBatch.impossibleCombos,
  };

  return document;
}

/**
 * After post-processing, ask SerpApi whether each "gap" cell really is novel.
 *
 * We do NOT auto-downgrade status to "rare" — Google Images titles are noisy
 * and we don't want fake anchors to slip past `hasConcreteExample`. Instead:
 *
 * - If hits ≥ minHits with multiple distinct sources, attach the discovered
 *   thumbnails to a candidate stub example on the cell (so the image
 *   generator has real visual references) and badge the cell as
 *   "Visual evidence found". The cell stays "gap" so the publishing gate
 *   still treats it as a frontier cell.
 * - If 0 hits returned, badge as "Verified absent" so the user can read a
 *   stronger signal that the gap is actually empty in the public web.
 *
 * Skipped silently if SERPAPI is not configured or the budget is exhausted.
 */
async function verifyGapCellsViaSerp(
  document: MapDocument,
  brief: NormalizedMapBrief,
  budget: ProbeBudget,
  collector?: GenerationMetricsCollector,
): Promise<MapDocument> {
  if (!getSerpApiKey() || budget.remaining() === 0) {
    return document;
  }

  const verifyT0 = Date.now();
  let probed = 0;
  let evidenceFound = 0;
  let confirmedAbsent = 0;

  // Bounded-concurrency worker pool over cell indexes so we don't burst
  // SerpApi with all gap cells simultaneously on large maps.
  const updatedCells: MapCell[] = document.cells.slice();
  const cellIndexes = document.cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.status === "gap" || cell.status === "tension")
    .map(({ index }) => index);

  let nextIdx = 0;
  async function worker() {
    while (nextIdx < cellIndexes.length) {
      const i = cellIndexes[nextIdx++];
      const cell = document.cells[i];
      if (budget.remaining() === 0) continue;

      // The cell label is a scene label (per the cell-generation prompt) and
      // already encodes coordinate-defining traits in human-readable form.
      // Adding raw coordinate values back in tends to add noise (e.g.
      // "Minimal High") that confuses Google Images, so probe the label only.
      const result = await probeLabelPicturability(brief.topic, cell.label, budget);
      if (result.skipped) {
        // no-key / budget / invalid-query: not a real signal, skip the cell
        // entirely rather than counting it as "verified absent".
        continue;
      }
      probed += 1;

      if (result.hits.length === 0) {
        confirmedAbsent += 1;
        const badges = Array.from(new Set([...cell.badges, "Verified absent"]));
        updatedCells[i] = { ...cell, badges };
        continue;
      }

      // Hits present. Treat ≥minHits with ≥1 distinct source as plausible visual evidence.
      const minHits = appConfig.generation.visualProbeMinHits;
      if (result.hits.length >= minHits && result.distinctSources >= 1) {
        evidenceFound += 1;
        const referenceImages: MapReferenceImage[] = result.hits
          .filter((hit) => hit.link)
          .slice(0, 4)
          .map((hit) => ({
            link: hit.link,
            thumbnail: hit.thumbnail,
            title: hit.title ? stripTaxonomyWords(hit.title) || hit.title : undefined,
            source: hit.source ? stripTaxonomyWords(hit.source) || hit.source : undefined,
          }));

        // Store the visual-evidence reference images on a candidate stub example
        // so the image generator pipeline (which reads cell.examples + their
        // referenceImages) can use them as grounding. The stub name starts with
        // "Search candidate" so PLACEHOLDER_NAME_PATTERNS rejects it from
        // featured-example backfill on any future repost-process pass.
        const stub: MapExample = {
          name: `Search candidate · ${cell.label}`.slice(0, 90),
          description: `Visual evidence surfaced by image search for the gap label "${cell.label}". Treat as a starting point for verification, not a confirmed anchor.`,
          coordinates: { ...cell.coordinates },
          status: "gap",
          referenceImages,
        };
        const badges = Array.from(new Set([...cell.badges, "Visual evidence found"]));
        updatedCells[i] = {
          ...cell,
          badges,
          examples: [...cell.examples, stub],
        };
      }
      // Sparse result (1 hit / single source) — neither absent nor strongly
      // evidenced. Leave the cell untouched but record the probe.
    }
  }

  const concurrency = Math.min(PROBE_DEFAULT_CONCURRENCY, cellIndexes.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  collector?.appendStage({
    stageId: "gap_verification",
    durationMs: Date.now() - verifyT0,
    externalCallCount: probed,
    extras: {
      probed,
      evidenceFound,
      confirmedAbsent,
    },
  });

  return {
    ...document,
    cells: updatedCells,
  };
}

export async function verifyAnchorsViaSerp(
  document: MapDocument,
  budget: ProbeBudget,
  collector?: GenerationMetricsCollector,
): Promise<MapDocument> {
  if (!getSerpApiKey() || budget.remaining() === 0) {
    return document;
  }

  const t0 = Date.now();
  let probed = 0;
  let verifiedExamples = 0;
  let inconclusiveExamples = 0;
  let removedExamples = 0;
  let downgradedCells = 0;

  const nextCells = document.cells.map((cell) => {
    if (cell.status !== "existing" && cell.status !== "rare") {
      return { ...cell };
    }
    return {
      ...cell,
      examples: [...cell.examples],
    };
  });

  const candidateIndexes = nextCells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.status === "existing" || cell.status === "rare")
    .map(({ index }) => index);

  let nextIdx = 0;
  async function worker() {
    while (nextIdx < candidateIndexes.length) {
      const index = candidateIndexes[nextIdx++];
      const cell = nextCells[index];
      const concreteExamples = dedupeConcreteExamplesByParent(cell.examples);
      if (concreteExamples.length === 0) {
        continue;
      }

      const verified: MapExample[] = [];
      for (const example of concreteExamples) {
        if (budget.remaining() === 0) {
          verified.push(example);
          continue;
        }
        const query = exampleVerificationQuery(example);
        const result = await budget.probe(query);
        if (result.skipped) {
          verified.push(example);
          continue;
        }
        probed += 1;
        const decision = shouldKeepExampleAfterProbe(example, result);
        if (decision.externallyVerified) {
          verifiedExamples += 1;
          verified.push(example);
          continue;
        }
        if (decision.retained) {
          inconclusiveExamples += 1;
          verified.push(example);
          continue;
        }
        removedExamples += 1;
      }

      const beforeStatus = cell.status;
      const verifiedParents = new Set(verified.map((example) => exampleParentIdentity(example))).size;
      let nextStatus = beforeStatus;
      if (beforeStatus === "existing" && verifiedParents < 2) {
        nextStatus = verifiedParents === 1 ? "rare" : "gap";
      } else if (beforeStatus === "rare" && verifiedParents < 1) {
        nextStatus = "gap";
      }

      if (nextStatus !== beforeStatus) {
        downgradedCells += 1;
      }

      nextCells[index] = {
        ...cell,
        status: nextStatus,
        confidence:
          nextStatus !== beforeStatus ? Math.min(cell.confidence, nextStatus === "rare" ? 0.68 : 0.52) : cell.confidence,
        badges:
          nextStatus !== beforeStatus
            ? Array.from(new Set([...cell.badges, "Anchor verification adjusted"]))
            : cell.badges,
        examples: verified.length ? verified : cell.examples.filter((example) => !hasConcreteExample(example)),
      };
    }
  }

  const concurrency = Math.min(PROBE_DEFAULT_CONCURRENCY, candidateIndexes.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  collector?.appendStage({
    stageId: "anchor_verification",
    durationMs: Date.now() - t0,
    externalCallCount: probed,
    extras: {
      verifiedExamples,
      inconclusiveExamples,
      removedExamples,
      downgradedCells,
    },
  });

  return {
    ...document,
    cells: nextCells.map(enforceEvidencePolicy),
    featuredExamples: dedupeConcreteExamplesByParent(
      [
        ...document.featuredExamples.filter(hasConcreteExample),
        ...nextCells.flatMap((cell) => cell.examples.filter(hasConcreteExample)),
      ],
    ).slice(0, 8),
  };
}

export async function buildMapJob(
  briefInput: MapBriefInput,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
  options?: { mapId?: string },
): Promise<{
  result: GenerationJobResult;
  normalizedBrief: NormalizedMapBrief | null;
  document: MapDocument | null;
}> {
  const liveId = options?.mapId;
  const normalizedBrief = await normalizeMapBrief(briefInput, sink, collector);
  if (!normalizedBrief.accepted) {
    return {
      result: {
        status: "rejected",
        guidance: normalizedBrief.guidance,
      },
      normalizedBrief,
      document: null,
    };
  }

  if (liveId) {
    // Surface a real scaffold early so failed or in-flight reserved maps still
    // resolve to a usable relational document instead of an empty placeholder.
    await applyMapPatch({
      mapId: liveId,
      mutate: (current) =>
        buildFallbackMapDocument(normalizedBrief, {
          slug: current.slug,
          title: current.title || undefined,
          seoTitle: current.seo.title || undefined,
          seoDescription: current.seo.description || undefined,
        }),
    });
  }

  const probeBudget = createProbeBudget();
  const rawDocument = await generateMapDocument(normalizedBrief, sink, collector, { mapId: liveId, probeBudget });
  if (!rawDocument) {
    return {
      result: {
        status: "failed",
        error: "Grounded generation unavailable.",
        guidance: ["Grounded generation unavailable; try again when model access is configured."],
      },
      normalizedBrief,
      document: null,
    };
  }
  emitStep(sink, "post_process", "start");
  const finishPost = collector?.chronometer("post_process");
  const postProcessed = postProcessMapDocument(rawDocument, normalizedBrief);
  finishPost?.();
  emitStep(sink, "post_process", "end");

  emitStep(sink, "anchor_verification", "start");
  const anchorBudget = createProbeBudget(Math.min(10, Math.max(0, appConfig.generation.serpProbeMaxCalls)));
  const finishAnchorVerify = collector?.chronometer("anchor_verification");
  const anchorVerified = await verifyAnchorsViaSerp(postProcessed, anchorBudget, collector);
  finishAnchorVerify?.();
  emitStep(sink, "anchor_verification", "end");

  emitStep(sink, "gap_verification", "start");
  const finishVerify = collector?.chronometer("gap_verification");
  const gapVerified = await verifyGapCellsViaSerp(anchorVerified, normalizedBrief, probeBudget, collector);
  finishVerify?.();
  emitStep(sink, "gap_verification", "end");
  const document = refineFrontierEvidence(gapVerified);

  if (liveId) {
    // Replace incrementally-built cells with the post-processed final cells so
    // the live grid converges to the publish-ready document.
    await applyMapPatch({
      mapId: liveId,
      mutate: (current) => ({
        ...document,
        slug: current.slug,
      }),
    });
  }

  if (!canAutoPublish(document)) {
    return {
      result: {
        status: "failed",
        error: "The generated map did not meet structural publish requirements.",
        guidance: ["Try a narrower topic, add dimensions, or include canonical examples."],
      },
      normalizedBrief,
      document,
    };
  }

  emitStep(sink, "reference_images", "start");
  const withReferences = await enrichMapDocumentReferenceImages(document, collector);
  const parsedDoc = mapDocumentSchema.safeParse(withReferences);
  const finalDocument = parsedDoc.success ? parsedDoc.data : withReferences;
  emitStep(sink, "reference_images", "end");

  return {
    result: {
      status: "success",
    },
    normalizedBrief,
    document: finalDocument,
  };
}

export function getTopicSuggestions() {
  return [
    "Topics with articulated rules—inference, regimes, morphology, inventories—produce crisp cells.",
    "Aim for exactly two truly independent axes that render as a clean 2D grid.",
    "Maps work when constraints can create rare edges, unexplored middles, and rule-blocked crossings.",
    "Avoid prompts that rehearse moods, popularity scores, aesthetic-only palettes, or unbounded novelty.",
  ];
}
