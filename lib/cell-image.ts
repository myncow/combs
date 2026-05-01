import { appConfig } from "@/lib/config";
import { buildCellVisualGroundingBundle, type VisualGroundingBundle } from "@/lib/cell-visual-grounding";
import type { CellVisualizationResult } from "@/lib/schema";
import type { MapCell, MapDocument } from "@/lib/types";
import { safeJsonParse } from "@/lib/utils";
import { finalizeVisualizationCaption } from "@/lib/visualization-caption";
import { resolveMapVisualSeries } from "@/lib/visual-series";
import type { CellVisualizationMetrics } from "@/lib/generation-metrics";

const CELL_VIZ_PRIMARY_DIRECTIVES_MAX = 2;
const CELL_VIZ_EARLY_ACCEPT_SCORE = 0.85;
const CELL_VIZ_FALLBACK_THRESHOLD = 0.65;
const CELL_VIZ_REPAIR_MIN_SCORE = 0.45;
const CELL_VIZ_REPAIR_MAX_SCORE = 0.84;

type ChatMessageContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: { url: string };
    };

type ChatImageResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      images?: unknown;
    };
  }>;
  error?: { message?: string; code?: number | string; metadata?: unknown };
};

/** Caps output budget; uncapped defaults can trigger upstream "affordability" / provider errors on OpenRouter. */
const OPENROUTER_IMAGE_MAX_TOKENS = 8192;

function chatContentHasImageUrls(content: string | ChatMessageContentPart[]): content is ChatMessageContentPart[] {
  return Array.isArray(content) && content.some((part) => part.type === "image_url");
}

function mergeTextOnlyUserContent(parts: ChatMessageContentPart[]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function formatOpenRouterImageError(status: number, payload: ChatImageResponse | null): string {
  const err = payload?.error;
  const message = err?.message;
  if (message && message !== "Provider returned error") {
    return message;
  }
  if (err && typeof err === "object" && Object.keys(err).length > 0) {
    try {
      return JSON.stringify(err);
    } catch {
      /* fall through */
    }
  }
  return message ?? `Image request failed (${status})`;
}

type CellVisualizationReview = {
  accepted: boolean;
  score: number;
  subjectFit: number;
  seriesFit: number;
  compositionFit: number;
  thumbnailFit: number;
  failures: string[];
  rationale: string;
};

type GeneratedCandidate = {
  result: CellVisualizationResult;
  model: string;
  directive: string;
  repairNotes?: string[];
  review?: CellVisualizationReview | null;
};

type AssistantMessage = NonNullable<NonNullable<ChatImageResponse["choices"]>[number]["message"]>;

const reviewJsonSchema = {
  type: "object",
  properties: {
    accepted: { type: "boolean" },
    score: { type: "number" },
    subjectFit: { type: "number" },
    seriesFit: { type: "number" },
    compositionFit: { type: "number" },
    thumbnailFit: { type: "number" },
    failures: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
    rationale: { type: "string" },
  },
  required: [
    "accepted",
    "score",
    "subjectFit",
    "seriesFit",
    "compositionFit",
    "thumbnailFit",
    "failures",
    "rationale",
  ],
  additionalProperties: false,
} as const;

function urlLooksLikeImageData(u: string): boolean {
  return u.startsWith("http") || u.startsWith("data:");
}

function pickUrlFromImageItem(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const direct = o.url;
  if (typeof direct === "string" && urlLooksLikeImageData(direct)) return direct;
  const nested =
    (o.image_url as { url?: string } | undefined)?.url ??
    (o.imageUrl as { url?: string } | undefined)?.url;
  if (typeof nested === "string" && urlLooksLikeImageData(nested)) return nested;
  return null;
}

function extractDataUrlFromText(s: string): string | null {
  const m = s.match(/data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+/);
  return m?.[0] ?? null;
}

function extractGeneratedImageUrl(message: AssistantMessage | undefined): string | null {
  if (!message) return null;
  const fromList = message.images;
  if (Array.isArray(fromList)) {
    for (const item of fromList) {
      const u = pickUrlFromImageItem(item);
      if (u) return u;
    }
  }
  const content = message.content;
  if (typeof content === "string") {
    const inline = extractDataUrlFromText(content);
    if (inline) return inline;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      const t = p.type;
      if (t === "image_url" || t === "output_image" || t === "image") {
        const u = pickUrlFromImageItem(p.image_url ?? p.imageUrl ?? part);
        if (u) return u;
      }
      if (typeof p.text === "string") {
        const fromText = extractDataUrlFromText(p.text);
        if (fromText) return fromText;
      }
    }
  }
  return null;
}

const TEXT_PART_TYPES = new Set(["text", "output_text", "input_text"]);
const NON_TEXT_PART_TYPES = new Set(["image_url", "output_image", "image", "input_image"]);

function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const p = part as Record<string, unknown>;
        const type = typeof p.type === "string" ? p.type : undefined;
        if (type && NON_TEXT_PART_TYPES.has(type)) return "";
        if (type && TEXT_PART_TYPES.has(type) && typeof p.text === "string") return p.text;
        if (typeof p.text === "string") return p.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function formatCoordinateLines(document: MapDocument, cell: MapCell): string {
  return Object.entries(cell.coordinates)
    .map(([key, val]) => {
      const dim = document.dimensions.find((d) => d.key === key);
      const label = dim?.label ?? key;
      const desc = dim?.description ? ` — ${dim.description}` : "";
      return `- ${label}: ${val}${desc}`;
    })
    .join("\n");
}

function formatGroundingCueLines(
  cues: VisualGroundingBundle["directEvidence"] | VisualGroundingBundle["neighborEvidence"],
  max: number,
) {
  if (cues.length === 0) {
    return "(none)";
  }
  return cues
    .slice(0, max)
    .map((cue) => {
      const shared = cue.sharedAxisLabels.length ? ` · shares ${cue.sharedAxisLabels.join(" + ")}` : "";
      return `- ${cue.name} · ${cue.coordinatesLabel}${shared} — ${cue.note}`;
    })
    .join("\n");
}

function formatReferenceImageLines(bundle: VisualGroundingBundle) {
  if (bundle.referenceImages.length === 0) {
    return "(No persisted reference images available; rely on the textual cues and shared series style.)";
  }
  return bundle.referenceImages
    .slice(0, 4)
    .map((image, index) => `- Ref ${index + 1}: ${image.reason}${image.title ? ` · ${image.title}` : ""}`)
    .join("\n");
}

function statusBriefFor(cell: MapCell): string {
  switch (cell.status) {
    case "gap":
      return "This cell marks a plausible frontier. Render a faithful synthesis of what would occupy the coordinate, borrowing visible traits from grounded examples instead of inventing a fake catalogued artifact.";
    case "tension":
      return "This cell is tense: the combination survives only as a strained hybrid or edge-case. Render a constrained subject that visibly carries that friction while still obeying the shared series style.";
    case "impossible":
      return "This cell is structurally blocked. Show a failed, incomplete, unstable, or non-cohering form that communicates the mismatch through anatomy, structure, or material logic alone.";
    case "rare":
      return "This cell is rare: render a documented long-tail instance if one exists.";
    default:
      return "Render one concrete canonical instance that sits at these exact coordinates.";
  }
}

const SUBJECT_MANDATE = `## Subject-object mandate (read first, overrides everything)
Render the subject for this map cell itself, not the map, not a chart, not a diagram, not an infographic, and not a "visualization of the cell" or of the axes. The map exists only to tell you what kind of subject to render and which coordinates it must satisfy.

Concretely: if the domain is "fish", render an actual fish. If the domain is "chairs", render an actual chair. If the domain is "leaves", render an actual leaf. If the domain is "bread", render an actual loaf. Never render the matrix, never render axes or arrows, never render a legend or callouts. The subject is the image.`;

const SERIES_GUARDRAILS = `## Series guardrails (mandatory)
Every image in this map must read as part of one coherent series.
- Keep the exact same medium, palette logic, lighting logic, texture, and overall visual language for every cell in this map.
- One primary subject only. Supporting habitat or environmental context is allowed only when it strengthens the subject and stays secondary.
- The primary subject should fill roughly 60-80% of the frame. Avoid tiny-subject / huge-landscape compositions.
- Favor a strong silhouette, one decisive pose, and a camera distance that makes the coordinate-defining traits readable even at thumbnail size.
- No text in the image: no labels, numbers, captions, titles, logos, watermarks, UI, legends, signage, or callouts.
- No diagrams, no maps, no grids, no axes, no infographics, no collages, and no renderings of the taxonomy itself.
- Never default to a retail catalog, e-commerce, or seamless studio product-shot look unless the chosen series style explicitly asks for it. It does not.
- For impossible cells, keep the same series style and show the subject failing or blocked within that style instead of switching to a diagram or abstract symbol.
- For impossible cells, do not use props, restraints, vines, cages, chains, lead weights, costumes, human hands, or symbolic objects to explain failure. The subject's own anatomy, geometry, or material logic should carry the mismatch.
- Materials, anatomy, scale cues, and textures should stay believable for the domain even when the cell is frontier-grade.`;

function buildPromptContext(document: MapDocument, cell: MapCell, detailed: boolean, grounding: VisualGroundingBundle) {
  const narrative = grounding.narrative;
  const coordLines = formatCoordinateLines(document, cell);
  const statusBrief = statusBriefFor(cell);
  const explanationLimit = detailed ? 1800 : 800;
  const trimmedExplanation = cell.explanation.trim();
  const explanation = trimmedExplanation
    ? trimmedExplanation.slice(0, explanationLimit) + (trimmedExplanation.length > explanationLimit ? "..." : "")
    : "";

  return { narrative, coordLines, statusBrief, explanation };
}

export function buildCellImagePrompt(
  document: MapDocument,
  cell: MapCell,
  detailed = false,
  options?: {
    grounding?: VisualGroundingBundle;
    candidateDirective?: string;
    repairNotes?: string[];
  },
): string {
  const grounding = options?.grounding ?? buildCellVisualGroundingBundle(document, cell);
  const series = resolveMapVisualSeries(document);
  const { narrative, coordLines, statusBrief, explanation } = buildPromptContext(document, cell, detailed, grounding);
  const imageLead = detailed
    ? "You are rendering one square frontier image plus a short caption that names the coordinate concept."
    : "Output one square frontier image plus a short caption that names the coordinate concept.";
  const contextBlock = detailed
    ? `## Map context (for concept selection only — do not render the map)
- Title: ${document.title}
- Domain: ${document.domain} · Family: ${document.topicFamily}
- Series preset: ${series.label}
- One-line summary: ${narrative || "(No summary — infer from coordinates.)"}`
    : `## Map context (for concept selection only — do not render the map)
${document.title} · domain: ${document.domain} · family: ${document.topicFamily} · series: ${series.label}`;

  const repairBlock = options?.repairNotes?.length
    ? `## Repair targets
${options.repairNotes.map((note) => `- ${note}`).join("\n")}`
    : "";

  return `${imageLead}

${SUBJECT_MANDATE}

${series.promptBlock}

${SERIES_GUARDRAILS}

${contextBlock}

## This cell's coordinates
${coordLines}

## About this frontier cell
- Label: ${cell.label}
- Status: ${cell.status}
- ${statusBrief}
${explanation ? `- Cell note: ${explanation}` : ""}

## Grounded evidence inside this cell
${formatGroundingCueLines(grounding.directEvidence, detailed ? 4 : 2)}

## Adjacent anchor evidence from existing/rare cells
${formatGroundingCueLines(grounding.neighborEvidence, detailed ? 6 : 3)}

## Persisted visual references available to you
${formatReferenceImageLines(grounding)}

## Focus for this draft
${[...grounding.focusDirectives, options?.candidateDirective].filter(Boolean).map((line) => `- ${line}`).join("\n")}

${repairBlock}

## Image brief
1. Render the coordinate concept itself. For frontier cells, prefer a faithful synthesis over inventing a fake named SKU, species, brand, or historical artifact.
2. Keep the shared series style fixed. Variation should come from the subject, pose, habitat fragment, materials, and composition inside that style, not from switching mediums.
3. Square 1:1 framing. Make the subject legible and present, not lost in empty space.
4. Prioritize immediate visual readability: one clear subject, one clear focal plane, and background context that supports rather than competes.
5. Use any attached reference images only for anatomy, materials, and context grounding. Do not collage, copy layouts literally, or paste multiple views together.
6. Do not draw the map, the matrix, the axes, a legend, or a "visualization of the cell." Render the subject itself.
7. For impossible cells, show the mismatch through the subject's own body plan, structure, or material form, not through external obstacles or narrative drama.
8. Caption rule: use "${cell.label}" or an equally short coordinate concept. Do not invent a branded or fake canonical proper noun unless the grounding evidence already names a documented instance. Keep it under 8 words.

## Reminder (do not forget)
- Render the subject, not the taxonomy.
- Zero typography anywhere in the image.
- Avoid sterile studio-backdrop language and retail presentation tropes.
- This should still read clearly as a strong image when reduced to a small tile in a public map.
- Keep the result coherent with the ${series.label} preset across the whole map.`;
}

function shouldUseFullPrompt(cell: MapCell, grounding: VisualGroundingBundle): boolean {
  if (cell.status === "gap" || cell.status === "tension" || cell.status === "impossible") {
    return true;
  }
  const explanationLength = cell.explanation.trim().length;
  const evidenceScore =
    grounding.directEvidence.length * 200 +
    grounding.neighborEvidence.length * 120 +
    grounding.referenceImages.length * 160;
  return explanationLength + evidenceScore > 700;
}

function buildImageInputContent(
  prompt: string,
  grounding: VisualGroundingBundle,
  previousCandidateUrl?: string,
): ChatMessageContentPart[] {
  const parts: ChatMessageContentPart[] = [
    {
      type: "text",
      text: `${prompt}

## Attached image references
Treat the following images as grounding for anatomy, materials, silhouette, and context only. Keep one coherent subject in one frame.`,
    },
  ];

  for (const image of grounding.referenceImages.slice(0, 4)) {
    parts.push({
      type: "image_url",
      image_url: { url: image.url },
    });
  }

  if (previousCandidateUrl) {
    parts.push({
      type: "image_url",
      image_url: { url: previousCandidateUrl },
    });
  }

  const notes = [
    grounding.referenceImages.length
      ? grounding.referenceImages
          .slice(0, 4)
          .map((image, index) => `- Ref ${index + 1}: ${image.reason}${image.title ? ` · ${image.title}` : ""}`)
          .join("\n")
      : "- No external reference images are attached for this draft.",
    previousCandidateUrl
      ? "- Final attached image is the previous failed draft. Correct its problems rather than repeating them."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  parts.push({
    type: "text",
    text: `Reference notes:
${notes}`,
  });

  return parts;
}

async function openRouterImageCompletion(
  apiKey: string,
  model: string,
  content: string | ChatMessageContentPart[],
  modalities: ("image" | "text")[],
): Promise<ChatImageResponse> {
  const openaiImageModel = model.startsWith("openai/") && /image/i.test(model);

  function bodyFor(userContent: string | ChatMessageContentPart[]) {
    return JSON.stringify({
      model,
      messages: [{ role: "user", content: userContent }],
      modalities,
      stream: false,
      max_tokens: OPENROUTER_IMAGE_MAX_TOKENS,
      ...(openaiImageModel ? {} : { temperature: 0.55 }),
    });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": appConfig.openRouter.siteUrl,
    "X-Title": `${appConfig.openRouter.appHttpTitle} Idea image`,
  };

  let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: bodyFor(content),
  });

  let payload = (await response.json().catch(() => null)) as ChatImageResponse | null;

  if (!response.ok && chatContentHasImageUrls(content)) {
    const stripped =
      mergeTextOnlyUserContent(content) +
      "\n\n(Reference image URLs were omitted after a failed multimodal request; follow the written notes and brief only.)";
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: bodyFor(stripped),
    });
    payload = (await response.json().catch(() => null)) as ChatImageResponse | null;
  }

  if (!response.ok) {
    throw new Error(formatOpenRouterImageError(response.status, payload));
  }
  return payload ?? {};
}

function visualizationFromPayload(payload: ChatImageResponse, cell: MapCell): CellVisualizationResult | null {
  for (const choice of payload?.choices ?? []) {
    const message = choice?.message;
    const url = extractGeneratedImageUrl(message);
    if (!url) continue;
    const rawCaption = textFromMessageContent(message?.content);
    return { imageUrl: url, caption: finalizeVisualizationCaption(rawCaption, cell) };
  }
  return null;
}

function normalizeReviewCandidate(candidate: unknown): CellVisualizationReview | null {
  if (!candidate || typeof candidate !== "object") return null;
  const review = candidate as Record<string, unknown>;
  const accepted = review.accepted;
  const score = review.score;
  const subjectFit = review.subjectFit;
  const seriesFit = review.seriesFit;
  const compositionFit = review.compositionFit;
  const thumbnailFit = review.thumbnailFit;
  const rationale = review.rationale;
  const failures = review.failures;

  if (
    typeof accepted !== "boolean" ||
    typeof score !== "number" ||
    typeof subjectFit !== "number" ||
    typeof seriesFit !== "number" ||
    typeof compositionFit !== "number" ||
    typeof thumbnailFit !== "number" ||
    typeof rationale !== "string" ||
    !Array.isArray(failures)
  ) {
    return null;
  }

  return {
    accepted,
    score: Math.max(0, Math.min(1, score)),
    subjectFit: Math.max(0, Math.min(1, subjectFit)),
    seriesFit: Math.max(0, Math.min(1, seriesFit)),
    compositionFit: Math.max(0, Math.min(1, compositionFit)),
    thumbnailFit: Math.max(0, Math.min(1, thumbnailFit)),
    failures: failures.map((failure) => String(failure)).slice(0, 6),
    rationale: rationale.trim().slice(0, 600),
  };
}

async function reviewCellVisualization(
  apiKey: string,
  document: MapDocument,
  cell: MapCell,
  candidate: CellVisualizationResult,
  grounding: VisualGroundingBundle,
): Promise<CellVisualizationReview | null> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appConfig.openRouter.siteUrl,
      "X-Title": `${appConfig.openRouter.appHttpTitle} Visual judge`,
    },
    body: JSON.stringify({
      model: appConfig.openRouter.model,
      messages: [
        {
          role: "system",
          content:
            "You are the visual quality gate for Lattice. Judge whether a generated image is faithful, visually legible, and worthy of appearing as a public map tile. Focus on subject fidelity, subject-not-diagram behavior, composition strength, thumbnail readability, text-free output, and consistency with the declared visual series. Respond with valid JSON only.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Review this image for the map cell below.

Map: ${document.title}
Domain: ${document.domain}
Cell label: ${cell.label}
Status: ${cell.status}
Coordinates:
${formatCoordinateLines(document, cell)}

Expected series style:
- Medium: ${grounding.styleSpec.medium}
- Composition: ${grounding.styleSpec.composition}
- Background: ${grounding.styleSpec.background}
- Lighting: ${grounding.styleSpec.lighting}
- Palette: ${grounding.styleSpec.palette}

Direct cues:
${formatGroundingCueLines(grounding.directEvidence, 3)}

Neighbor cues:
${formatGroundingCueLines(grounding.neighborEvidence, 4)}

Candidate caption: ${candidate.caption ?? cell.label}

Accept only if the image clearly depicts the subject itself, stays text-free, avoids diagram/map behavior, fits the requested coordinate plus shared series style, and remains readable as a small thumbnail.
Reject images that feel muddy, over-cluttered, stock-like, too distant, dominated by background, or split across multiple competing subjects.`,
            },
            {
              type: "image_url",
              image_url: { url: candidate.imageUrl },
            },
          ],
        },
      ],
      temperature: 0.1,
      provider: {
        require_parameters: true,
      },
      plugins: [{ id: "response-healing" }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cell_visualization_review",
          strict: true,
          schema: reviewJsonSchema,
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as ChatImageResponse | null;
  if (!response.ok) {
    return null;
  }

  const raw = textFromMessageContent(payload?.choices?.[0]?.message?.content);
  return normalizeReviewCandidate(safeJsonParse<CellVisualizationReview>(raw));
}

function reviewScore(candidate: GeneratedCandidate) {
  const review = candidate.review;
  if (!review) return 0;
  return (
    review.score * 0.38 +
    review.subjectFit * 0.24 +
    review.seriesFit * 0.16 +
    review.compositionFit * 0.12 +
    review.thumbnailFit * 0.1 +
    (review.accepted ? 0.15 : 0)
  );
}

function buildCandidateDirectives(bundle: VisualGroundingBundle) {
  const directives = bundle.focusDirectives.slice(0, CELL_VIZ_PRIMARY_DIRECTIVES_MAX);
  while (directives.length < CELL_VIZ_PRIMARY_DIRECTIVES_MAX) {
    directives.push(
      "Favor one strong, inspectable subject with a clear silhouette and restrained supporting context.",
    );
  }
  return directives.slice(0, CELL_VIZ_PRIMARY_DIRECTIVES_MAX);
}

function reviewRawScore(review: CellVisualizationReview | null | undefined): number {
  return review?.score ?? 0;
}

async function generateCandidate(
  apiKey: string,
  model: string,
  document: MapDocument,
  cell: MapCell,
  grounding: VisualGroundingBundle,
  directive: string,
  repairNotes?: string[],
  previousCandidateUrl?: string,
): Promise<GeneratedCandidate | null> {
  const detailed = shouldUseFullPrompt(cell, grounding);
  const prompt = buildCellImagePrompt(document, cell, detailed, {
    grounding,
    candidateDirective: directive,
    repairNotes,
  });
  const payload = await openRouterImageCompletion(
    apiKey,
    model,
    buildImageInputContent(prompt, grounding, previousCandidateUrl),
    ["image", "text"],
  );
  const result = visualizationFromPayload(payload, cell);
  if (!result) {
    return null;
  }

  return {
    result,
    model,
    directive,
    repairNotes,
  };
}

export async function generateCellVisualizationWithMetrics(
  document: MapDocument,
  cell: MapCell,
): Promise<{ result: CellVisualizationResult | null; metrics: CellVisualizationMetrics }> {
  const metrics: CellVisualizationMetrics = {
    version: 1,
    imageGenerationCalls: 0,
    reviewCalls: 0,
    fallbackImageModelUsed: false,
    repairAttempts: 0,
    directivesTriedPrimary: 0,
    directivesTriedFallback: 0,
    earlyAcceptStopped: false,
  };
  const wall0 = Date.now();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    metrics.wallTimeMsTotal = Date.now() - wall0;
    return { result: null, metrics };
  }
  const openRouterApiKey = apiKey;

  const grounding = buildCellVisualGroundingBundle(document, cell);
  const primaryModel = appConfig.openRouter.imageGenerationModel;
  const fallbackModel = appConfig.openRouter.imageFallbackModel;
  const directives = buildCandidateDirectives(grounding);

  const candidates: GeneratedCandidate[] = [];
  let lastError: Error | undefined;
  let earlyStop = false;

  async function directivePass(model: string, countingFallback: boolean) {
    for (const directive of directives) {
      if (earlyStop) {
        return;
      }

      try {
        metrics.imageGenerationCalls++;
        if (countingFallback) {
          metrics.directivesTriedFallback++;
        } else {
          metrics.directivesTriedPrimary++;
        }

        const candidate = await generateCandidate(openRouterApiKey, model, document, cell, grounding, directive);
        if (!candidate) {
          continue;
        }

        metrics.reviewCalls++;
        candidate.review = await reviewCellVisualization(
          openRouterApiKey,
          document,
          cell,
          candidate.result,
          grounding,
        );
        candidates.push(candidate);

        if (candidate.review?.accepted && reviewRawScore(candidate.review) >= CELL_VIZ_EARLY_ACCEPT_SCORE) {
          earlyStop = true;
          metrics.earlyAcceptStopped = true;
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  await directivePass(primaryModel, false);

  const anyAccepted = candidates.some((candidate) => candidate.review?.accepted);
  const bestRaw =
    candidates.length > 0 ? Math.max(...candidates.map((candidate) => reviewRawScore(candidate.review))) : 0;

  const shouldTryFallback =
    !metrics.earlyAcceptStopped &&
    !anyAccepted &&
    bestRaw < CELL_VIZ_FALLBACK_THRESHOLD &&
    Boolean(fallbackModel) &&
    fallbackModel !== primaryModel;

  if (shouldTryFallback && fallbackModel) {
    metrics.fallbackImageModelUsed = true;
    await directivePass(fallbackModel, true);
  }

  if (!candidates.length) {
    metrics.wallTimeMsTotal = Date.now() - wall0;
    if (lastError) throw lastError;
    return { result: null, metrics };
  }

  candidates.sort((a, b) => reviewScore(b) - reviewScore(a));
  let best = candidates[0]!;

  const review = best.review;
  const canRepair =
    review &&
    review.failures.length > 0 &&
    review.score >= CELL_VIZ_REPAIR_MIN_SCORE &&
    review.score <= CELL_VIZ_REPAIR_MAX_SCORE;

  if (canRepair) {
    metrics.repairAttempts++;
    try {
      metrics.imageGenerationCalls++;
      const repair = await generateCandidate(
        openRouterApiKey,
        best.model,
        document,
        cell,
        grounding,
        best.directive,
        best.review?.failures.slice(0, 4),
        best.result.imageUrl,
      );
      if (repair) {
        metrics.reviewCalls++;
        repair.review = await reviewCellVisualization(
          openRouterApiKey,
          document,
          cell,
          repair.result,
          grounding,
        );
        if (reviewScore(repair) > reviewScore(best)) {
          best = repair;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  metrics.wallTimeMsTotal = Date.now() - wall0;

  if (!best.result && lastError) {
    throw lastError;
  }

  return { result: best.result, metrics };
}

export async function generateCellVisualizationImage(
  document: MapDocument,
  cell: MapCell,
): Promise<CellVisualizationResult | null> {
  const { result } = await generateCellVisualizationWithMetrics(document, cell);
  return result;
}
