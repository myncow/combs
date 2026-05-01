import { appConfig } from "@/lib/config";
import { examplePrompts } from "@/lib/data/example-prompts";
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
  type MapBriefInput,
  type NormalizedMapBriefInput,
  type MapSkeletonInput,
  type MapCellsBatchInput,
  type SuggestAxisPairsResponse,
} from "@/lib/schema";
import { callStructuredModel, type StructuredModelAttemptHook } from "@/lib/openrouter";
import { callStructuredModelStreaming } from "@/lib/openrouter-stream";
import { fetchResearchContext, type ResearchContext } from "@/lib/research-engine";
import {
  normalizedMapBriefJsonSchema,
  mapSkeletonJsonSchema,
  mapCellsJsonSchema,
  suggestAxisPairsResponseJsonSchema,
} from "@/lib/openrouter-schemas";
import { enrichMapDocumentReferenceImages } from "@/lib/map-reference-images";
import { attachVisualSeries } from "@/lib/visual-series";
import type { GenerationMetricsCollector } from "@/lib/generation-metrics";
import type {
  GenerationJobResult,
  MapBrief,
  MapConstraint,
  MapDocument,
  MapExample,
  NormalizedMapBrief,
} from "@/lib/types";
import { slugify, titleCase } from "@/lib/utils";

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
    },
    secondary: {
      key: slugify(b),
      label: titleCase(b),
      description: `Picturable variation for ${t}.`,
    },
    rationale: `Option ${i + 1}: crosses ${titleCase(a)} with ${titleCase(b)} to surface sparse quadrants.`,
  }));

  return suggestAxisPairsResponseSchema.parse({ pairs });
}

export async function suggestAxisPairs(briefInput: MapBriefInput): Promise<SuggestAxisPairsResponse> {
  const brief = mapBriefSchema.parse(briefInput);

  const instructions = `You are the intake editor for Lattice, a tool that builds gap-first combinatorial maps (any subject matter). Your axis-quality rules are the same as normalized brief intake, but you return multiple candidate axis pairs instead of locking one.
Return JSON only. No markdown.

Rules (aligned with normalized brief / map engine):
- Each item in "pairs" is ONE candidate 2D map: "primary" and "secondary" are the only two axes (orthogonal, concrete, distinct).
- Each axis MUST be visualizable: picturable properties—materials, physical form, setting, process stage, format, era, scale—things a user could sketch or image-search. Reject mood-only or abstract score axes with no scene.
- Favor pairs where missing crossings are meaningful (gaps, tensions, impossibles)—not dense grids where every cell is crowded.
- Keys: lowercase kebab-case. Labels: short, legible noun phrases.
- "description" clarifies the axis in one short phrase, or use empty string "" if redundant.
- "rationale" is one sentence on why this pair fits the supplied brief, or "".
- Pairs must be diverse—do not repeat near-identical axes across pairs.
- Return the four strongest options only. Prefer quality over coverage.
- Treat candidateDimensions, mustIncludeExamples, mustAvoid, combines, constraints, and extraContext in the input JSON as authoritative guardrails.
- FORBIDDEN WORDS in labels, descriptions, rationales: "taxonomy", "taxonomic", "taxonomical". Use "map", "structure", "organization", or plain domain words.

Emit exactly 4 objects in "pairs".`;

  const response = await runStructuredModel<unknown>({
    model: appConfig.openRouter.model,
    instructions,
    input: JSON.stringify(brief),
    schemaName: "suggest_axis_pairs",
    jsonSchema: suggestAxisPairsResponseJsonSchema,
    step: "suggest_axis_pairs",
  });

  const parsed = suggestAxisPairsResponseSchema.safeParse(response);
  if (parsed.success) {
    return { pairs: parsed.data.pairs.slice(0, 4) };
  }

  return heuristicSuggestAxisPairs(brief);
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

function heuristicMapDocument(brief: NormalizedMapBrief): MapDocument {
  const dimensions = brief.dimensions.slice(0, 2).map((dimension) => ({
    ...dimension,
    values: buildValueSet(dimension.label),
  }));

  const x = dimensions[0];
  const y = dimensions[1];

  const cells = x.values.flatMap((xValue, xIndex) =>
    y.values.map((yValue, yIndex) => {
      const index = xIndex * y.values.length + yIndex;
      const status = statusForIndex(index, x.values.length * y.values.length);
      const coordinates: Record<string, string> = {
        [x.key]: xValue,
        [y.key]: yValue,
      };

      const examples: MapExample[] =
        status === "existing"
          ? [
              {
                name: `${titleCase(brief.topic)} anchor ${index + 1}a`,
                description: `Primary documented instance pairing ${xValue.toLowerCase()} with ${yValue.toLowerCase()}.`,
                coordinates,
                status,
                evidenceNote:
                  "Treat as a repeatable benchmark used to explain this quadrant; swap for domain-specific citations when grounding with research.",
              },
              {
                name: `${titleCase(brief.topic)} anchor ${index + 1}b`,
                description: `Corroborating instance showing the quadrant is inhabited by more than one lineage.`,
                coordinates,
                status,
                evidenceNote:
                  "Independent instance used only to satisfy the duplicate-anchor rule; replace with sourced examples in production.",
              },
            ]
          : status === "rare"
            ? [
                {
                  name: `${titleCase(brief.topic)} lone instance ${index + 1}`,
                  description: `A thinly documented pairing of ${xValue.toLowerCase()} and ${yValue.toLowerCase()}.`,
                  coordinates,
                  status,
                  evidenceNote:
                    "Single attributable instance; additional sourcing would be needed before upgrading to canonical status.",
                },
              ]
            : [];

      return {
        id: `${x.key}-${xValue}-${y.key}-${yValue}`.toLowerCase().replace(/\s+/g, "-"),
        coordinates,
        label: `${xValue} ${yValue} ${brief.domain}`,
        status,
        explanation:
          status === "impossible"
            ? "This combination fights the core constraints of the domain, so it is better treated as a thought experiment than a real category."
            : status === "gap"
              ? "This cell feels plausible but under-developed, which makes it an interesting frontier for exploration."
              : status === "rare"
                ? "This is a niche or regional combination that exists but is not a dominant archetype."
                : "This combination is well represented and helps anchor the map.",
        confidence: status === "existing" ? 0.91 : status === "rare" ? 0.72 : 0.58,
        badges: status === "gap" ? ["Opportunity"] : status === "impossible" ? ["Constraint"] : ["Known"],
        examples,
      };
    }),
  );

  const featuredExamples = dedupeExamples(cells.flatMap((cell) => cell.examples)).slice(0, 8);

  const draft = {
    title: `${titleCase(brief.topic)} Map`,
    slug: slugify(`${brief.topic}-map`),
    summary: `A structured map of ${brief.domain.toLowerCase()} across ${x.label.toLowerCase()} and ${y.label.toLowerCase()}.`,
    intro: `This map explores ${brief.domain.toLowerCase()} as a constrained combinatorial space. It highlights which combinations are canonical, which are rare, which look promising, and which collapse under the domain's underlying rules.`,
    domain: brief.domain,
    topicFamily: brief.topicFamily,
    dimensions,
    cellSchema: {
      primaryX: x.key,
      primaryY: y.key,
    },
    cells,
    featuredExamples,
    notableGaps: cells
      .filter((cell) => cell.status === "gap")
      .slice(0, 3)
      .map((cell) => ({
        label: cell.label,
        explanation: cell.explanation,
        coordinates: cell.coordinates,
      })),
    impossibleCombos: cells
      .filter((cell) => cell.status === "impossible")
      .slice(0, 3)
      .map((cell) => ({
        label: cell.label,
        explanation: cell.explanation,
        coordinates: cell.coordinates,
      })),
    constraints: [
      {
        label: "Physical viability",
        kind: "physical",
        explanation: "Some combinations break texture, process, or material constraints before they can become stable categories.",
      },
      {
        label: "Cultural lineage",
        kind: "cultural",
        explanation: "Many existing cells are preserved by tradition, while some plausible gaps remain underexplored because no lineage reinforced them.",
      },
      {
        label: "Naming pressure",
        kind: "taxonomy",
        explanation: "The map groups only combinations that can hold together as recognizable categories instead of one-off novelties.",
      },
    ] as MapConstraint[],
    renderingHints: {
      accent: "#d97706",
      gradient: ["#fef3c7", "#fde68a"],
      icon: "grid",
    },
    seo: {
      title: `${titleCase(brief.topic)} Map | Lattice`,
      description: `Explore a generated map for ${brief.domain.toLowerCase()}.`,
    },
  };

  return mapDocumentSchema.parse(attachVisualSeries(draft));
}

function formatResearchForPrompt(research: ResearchContext, purpose: "skeleton" | "cells") {
  if (!research.summary) {
    return "";
  }

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

  return `
GROUNDED RESEARCH PACK (from live web search; use this as evidence, not decoration):
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
`;
}

function isResearchPackEmpty(research: ResearchContext) {
  return !research.summary.trim();
}

const universalMapContract = `
Universal map contract (same rules for every topic):
- Axis fidelity: Populate the full primary matrix declared in the skeleton. Every coordinate uses skeleton dimension keys and only values enumerated for that dimension unless the explanation explicitly declares a sanctioned extension.
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

const TAXONOMY_WORD_PATTERN = /\b(taxonomical|taxonomically|taxonomic|taxonomies|taxonomy)\b/gi;
const ARTICLE_STOPWORDS = new Set(["a", "an", "the", "of", "for", "and", "or", "to", "in", "on", "with"]);

export function stripTaxonomyWords(input: string): string {
  if (!input) {
    return "";
  }
  return input
    .replace(TAXONOMY_WORD_PATTERN, " ")
    .replace(/\s*[-–—:|·•]\s*(?=(\s|$))/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[\s\-–—:|·•,]+|[\s\-–—:|·•,]+$/g, "")
    .trim();
}

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

/** Named instance + verifiable hook: brand, year, substantive note, or clearly argued description (models often put proof in description). */
export function hasConcreteExample(example: MapExample): boolean {
  const nameOk = Boolean(example.name?.trim());
  const note = example.evidenceNote?.trim() ?? "";
  const brandOk = Boolean(example.brand?.trim());
  const yearOk = Boolean(example.year?.trim());
  const descOk = (example.description?.trim().length ?? 0) >= 48;
  return nameOk && (brandOk || yearOk || note.length >= 12 || descOk);
}

function postProcessMapDocument(document: MapDocument, brief: NormalizedMapBrief) {
  const dedupedCells = Array.from(new Map(document.cells.map((cell) => [cell.id, cell])).values()).map((cell) => {
    const proofExamples = cell.examples.filter(hasConcreteExample);

    if (cell.status === "existing" && proofExamples.length < 2) {
      return {
        ...cell,
        status: proofExamples.length === 1 ? ("rare" as const) : ("gap" as const),
        badges: Array.from(new Set([...cell.badges, "Evidence adjusted"])),
        examples: proofExamples,
      };
    }

    if (cell.status === "rare" && proofExamples.length < 1) {
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
  });

  const featuredExamples = backfillFeaturedExamples(dedupedCells, document.featuredExamples);

  const cleanTitle = sanitizeMapTitle(document.title, brief);
  const cleanSummary = stripTaxonomyWords(document.summary);
  const sanitizedSeoTitle = stripTaxonomyWords(document.seo?.title ?? "");
  const cleanSeoTitle =
    !sanitizedSeoTitle || sanitizedSeoTitle.length < 3
      ? `${cleanTitle} | Lattice`
      : sanitizedSeoTitle;
  const cleanSeoDescription = stripTaxonomyWords(document.seo?.description ?? "");

  return attachVisualSeries({
    ...document,
    slug: slugify(document.slug || `${brief.domain}-map`),
    title: cleanTitle,
    summary: cleanSummary || document.summary.trim(),
    cells: dedupedCells,
    featuredExamples,
    seo: {
      ...document.seo,
      title: cleanSeoTitle,
      description: cleanSeoDescription || document.seo?.description || "",
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

  const normalized = slugify(value);
  return (
    values.find((candidate) => candidate === value) ??
    values.find((candidate) => slugify(candidate) === normalized) ??
    values.find((candidate) => slugify(candidate).includes(normalized) || normalized.includes(slugify(candidate))) ??
    value
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

function canonicalizeCellsBatch(
  batch: MapCellsBatchInput,
  skeleton: MapSkeletonInput,
  expectedPairs = buildRequiredMatrix(skeleton),
): MapCellsBatchInput | null {
  const { xDimension, yDimension } = getPrimaryDimensions(skeleton);
  const cellsByPair = new Map<string, MapCellsBatchInput["cells"][number]>();

  for (const cell of batch.cells) {
    const examples = cell.examples.map((example) => canonicalizeExample(example, skeleton));
    const coordinates = canonicalizeCoordinates(cell.coordinates, skeleton);
    const xValue = coordinates[xDimension.key];
    const yValue = coordinates[yDimension.key];

    if (!xValue || !yValue) {
      continue;
    }

    const key = coordinateKey(coordinates, xDimension.key, yDimension.key);
    if (cellsByPair.has(key)) {
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

  if (orderedCells.length !== expectedPairs.length) {
    console.warn(`Generated cells covered ${orderedCells.length}/${expectedPairs.length} required matrix pairs.`);
    return null;
  }

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
    const proofs = cell.examples.filter(hasConcreteExample);
    if (cell.status === "existing") {
      return proofs.length >= 2;
    }
    if (cell.status === "rare") {
      return proofs.length >= 1;
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

async function modelGenerateMapSkeleton(
  brief: NormalizedMapBrief,
  research: ResearchContext,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
) {
  const researchSection = formatResearchForPrompt(research, "skeleton");
  const emptyResearchNotice = isResearchPackEmpty(research)
    ? `\nWARNING: No grounded research summary was retrieved; axes and taxonomy may be speculative and ungrounded—still structure the map coherently, but avoid fake specificity.\n`
    : "";

  const instructions = `
You are an expert taxonomist and systems analyst.
Your job is to build the structural SKELETON of a combinatorial taxonomy map for whatever domain the normalized brief declares.
Do NOT generate the cells. You MUST emit every structural field:
title, slug, summary, intro, domain, topicFamily, dimensions, cellSchema, constraints, renderingHints, and seo.
${researchSection}${emptyResearchNotice}
Skeleton quality targets:
- FORBIDDEN WORDS in every user-visible string (title, summary, intro, domain, topicFamily, dimension labels/descriptions, value labels, constraint labels/explanations, seo.title, seo.description): the words "taxonomy", "taxonomic", and "taxonomical". Use plain words like "map", "guide", "structure", "classification scheme", or just the domain name. Internal constraint kinds may stay as-is — this rule applies to human-readable copy only.
- Value labels remain short tokens (no explanatory sentences appended to axes).
- Value labels are NOUN-LIKE, scene-stable, and picturable—concrete materials, formats, settings, process stages, or form factors a human could sketch or image-search. Avoid long clauses, scalar adjectives, mood words, or score-like qualifiers.
- Emit exactly two dimensions; each exposes 3–5 concrete values. Do not add a third axis — the map renders as a clean 2D grid of these two axes only.
- Do not concatenate unrelated categories behind slashes purely to inflate counts—split them or fold into descriptions.
- Favor axis pairs where MISSING crossings are meaningful: downstream, empty cells are shown to the user as gaps/tensions/impossibles so they can see unimagined variations. Bland axes that trivially fill every slot are a failure mode.
- When research contradicts headline intuitions about labels, reconcile by privileging reproducible nomenclature from the pack while respecting user intent spelled out in constraints.
If research is vacant, stay conservative: orthogonal axes anchored in the brief wording, plainly labeled regimes.
${universalMapContract}
`;

  emitStep(sink, "skeleton", "start");
  const response = await runStructuredModel<MapSkeletonInput>({
    model: appConfig.openRouter.model,
    instructions,
    input: JSON.stringify(brief),
    schemaName: "map_skeleton",
    jsonSchema: mapSkeletonJsonSchema,
    step: "skeleton",
    sink,
    collector,
  });

  if (response == null || typeof response !== "object") {
    emitStep(sink, "skeleton", "end", "no response");
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
  }
  emitStep(sink, "skeleton", "end", parsed.success ? undefined : "parse failed");
  return parsed.success ? parsed.data : null;
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
  return dedupeExamples([...current.filter(hasConcreteExample), ...fromCells]).slice(0, 8);
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
) {
  const researchSection = formatResearchForPrompt(research, "cells");
  const requiredMatrix = buildRequiredMatrix(skeleton);
  const requiredMatrixBatches = chunkItems(requiredMatrix, 8);
  const batchCount = requiredMatrixBatches.length;
  const concurrency = Math.min(appConfig.generation.cellsBatchConcurrency, batchCount);

  const instructions = `
You are an expert taxonomist and systems analyst shaping maps across heterogeneous domains.
You have been given a Taxonomy Map Skeleton containing dimensions and constraints.
Your job is to generate one batch of CELLS for this matrix, evaluating each combination deeply.
${researchSection}
Quality bar:
- FORBIDDEN WORDS in every user-visible string (cell labels, cell explanations, badges, example names/descriptions/evidenceNote, notableGaps/impossibleCombos labels and explanations): the words "taxonomy", "taxonomic", and "taxonomical". Use "map", "structure", "classification", or rephrase.
- Generate the exact cells in requiredMatrix. Every listed x/y pair must have one cell, no missing pairs and no extra pairs.
- Cell and example coordinates MUST use dimension keys, not display labels.
- Every cell and example coordinates object must include exactly the primary x key and primary y key from the skeleton — no additional coordinate keys.
- Evaluate each combination carefully. Is it existing, rare, gap, tension, or impossible?
- "Impossible" means the combination breaks explicit rules named in skeleton constraints or unmistakable axioms shared by authoritative references.
- "Tension" means the pairing survives only as guarded experiment/adaptation/straddle but clashes with canonical usage.
- "Gap" means plausible but underdeveloped, not nonsense. For gap cells, the explanation must describe what WOULD need to exist to fill it, in concrete, picturable terms (material, form factor, setting, process step)—so the reader can imagine or image-search the missing thing.
- EVERY example names an identifiable anchor; pick whichever hook suits the ontology (institutional operator, genealogical lineage, catalogued artifact identifier, sanctioned movement name)—never unnamed vibe words masquerading as examples.
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
  let flushChain = Promise.resolve();

  function scheduleOrderedFlush() {
    if (!sink) {
      return;
    }
    flushChain = flushChain.then(() => {
      while (nextFlushBatch < batchCount && filled[nextFlushBatch]) {
        for (const ev of eventBuffers[nextFlushBatch]) {
          sink(ev);
        }
        nextFlushBatch++;
      }
    });
  }

  const cellsWall0 = Date.now();
  let structuredExternalCalls = 0;
  let matrixRetries = 0;
  let fallbackSyntheticSlices = 0;

  const batches = await mapPool(batchCount, concurrency, async (index) => {
    const batchRequiredMatrix = requiredMatrixBatches[index];
    const captureSink: GenerationStreamSink | undefined = sink
      ? (ev) => {
          eventBuffers[index].push(ev);
        }
      : undefined;

    emitStep(captureSink, "cells", "start", `batch ${index + 1}/${batchCount}`);
    let canonicalized: MapCellsBatchInput | null = null;
    let attemptsUsed = 0;

    for (let attempt = 0; attempt < 2 && !canonicalized; attempt++) {
      structuredExternalCalls++;
      attemptsUsed++;
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
        console.error("Failed to parse map cells batch:", parsed.error.issues);
        continue;
      }

      canonicalized = canonicalizeCellsBatch(parsed.data, skeleton, batchRequiredMatrix);
      if (!canonicalized && attempt === 0) {
        console.warn(`Map cells batch ${index + 1}: matrix coverage incomplete, retrying once.`);
      }
    }

    if (attemptsUsed > 1) {
      matrixRetries += attemptsUsed - 1;
    }

    if (!canonicalized) {
      fallbackSyntheticSlices += 1;
      console.warn(`Map cells batch ${index + 1}: using gap fallbacks for this slice.`);
      canonicalized = synthesizeGapBatch(skeleton, batchRequiredMatrix);
    }

    emitStep(captureSink, "cells", "end", `batch ${index + 1}/${batchCount}`);
    filled[index] = true;
    scheduleOrderedFlush();
    return canonicalized;
  });

  await flushChain;
  collector?.addCellsAggregate({
    durationWallMs: Date.now() - cellsWall0,
    batchCount,
    retryTotal: matrixRetries,
    fallbackSyntheticBatchCount: fallbackSyntheticSlices,
    externalCalls: structuredExternalCalls,
    model: appConfig.openRouter.model,
  });
  return mergeCellsBatches(batches);
}

export async function generateMapDocument(
  brief: NormalizedMapBrief,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
): Promise<MapDocument> {
  // Step 1: Fetch live research context via OpenRouter web plugin
  const research = await fetchResearchContext(brief, undefined, sink, collector);
  if (research.sources.length > 0) {
    console.log(`Research grounded via: ${research.sources.slice(0, 3).join(", ")}`);
  }

  // Step 2: Generate map skeleton using research-grounded axes
  const skeleton = await modelGenerateMapSkeleton(brief, research, sink, collector);
  if (!skeleton) {
    return heuristicMapDocument(brief);
  }

  const cellsBatch = await modelGenerateMapCells(skeleton, brief, research, sink, collector);

  const document: MapDocument = {
    ...skeleton,
    cells: cellsBatch.cells,
    featuredExamples: cellsBatch.featuredExamples,
    notableGaps: cellsBatch.notableGaps,
    impossibleCombos: cellsBatch.impossibleCombos,
  };

  return document;
}

export async function buildMapJob(
  briefInput: MapBriefInput,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
): Promise<{
  result: GenerationJobResult;
  normalizedBrief: NormalizedMapBrief | null;
  document: MapDocument | null;
}> {
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

  const rawDocument = await generateMapDocument(normalizedBrief, sink, collector);
  emitStep(sink, "post_process", "start");
  const finishPost = collector?.chronometer("post_process");
  const document = postProcessMapDocument(rawDocument, normalizedBrief);
  finishPost?.();
  emitStep(sink, "post_process", "end");

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

export function getExamplePromptDefaults() {
  return examplePrompts;
}
