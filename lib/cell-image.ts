import { appConfig, resolveRequestedImageModel } from "@/lib/config";
import { buildCellVisualGroundingBundle, type VisualGroundingBundle } from "@/lib/cell-visual-grounding";
import type { CellVisualizationResult } from "@/lib/schema";
import type { MapCell, MapDocument } from "@/lib/types";
import { resolveMapVisualSeries } from "@/lib/visual-series";
import type { CellVisualizationMetrics } from "@/lib/generation-metrics";

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

/** Caps output budget; uncapped defaults can trigger upstream affordability errors on OpenRouter. */
const OPENROUTER_IMAGE_MAX_TOKENS = 8192;

/**
 * OpenRouter image generation: Gemini / multimodal GPT image models need both modalities or they
 * return text-only (no `images`). Image-first models (FLUX, Seedream, etc.) use `["image"]` only.
 * @see https://openrouter.ai/docs/features/multimodal/image-generation
 */
function openRouterImageModalities(model: string): ("image" | "text")[] {
  const id = model.toLowerCase();
  if (id.startsWith("black-forest-labs/") || id.startsWith("bytedance-seed/") || id.startsWith("sourceful/")) {
    return ["image"];
  }
  return ["image", "text"];
}

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

type AssistantMessage = NonNullable<NonNullable<ChatImageResponse["choices"]>[number]["message"]>;

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
      return "This cell is a plausible but underfilled frontier. Render a finished, believable in-domain example assembled from visible traits in the grounded examples.";
    case "tension":
      return "This cell is a hard-but-viable edge case. Render a finished in-domain example under specific visual assumptions; do not dramatize tension or make the subject look broken.";
    case "impossible":
      return "This cell is marked impossible in the current map logic, but the image should still stay in-domain. Render the closest plausible version of this exact subject category, making only the minimum visible assumptions needed for the coordinates to coexist.";
    case "rare":
      return "This cell is rare: render a documented long-tail instance if one exists, otherwise render a grounded photorealistic example consistent with nearby anchors.";
    default:
      return "Render one concrete canonical photorealistic instance that sits at these exact coordinates.";
  }
}

function plausibilityConstructionFor(cell: MapCell): string {
  switch (cell.status) {
    case "gap":
      return "Build the image by combining the most relevant visible traits from direct and adjacent examples into one coherent, already-existing-looking subject.";
    case "tension":
      return "Choose a concrete visual compromise inside the same subject category that lets both coordinates coexist: a specialized body plan, support structure, use context, material choice, process stage, or environmental setup.";
    case "impossible":
      return "Silently choose one or two visible assumptions that would make this coordinate possible without changing the subject category, then render the finished result. The assumptions should be small and inspectable: habitat support, posture, proportion, material detail, surface treatment, scale cue, or production/process context. If an assumption would turn the image into a different domain, do not use it. Do not show impossibility, tension, failure, damage, collapse, external obstacles, or an unrelated workaround scene.";
    case "rare":
      return "Anchor the image in documented examples when available, then use adjacent examples only to fill missing visual detail.";
    default:
      return "Anchor the image in the clearest canonical examples for this coordinate.";
  }
}

/**
 * Combined subject + medium mandate. Replaces the prior three top-of-prompt
 * blocks (SUBJECT_MANDATE + PHOTOREALISM_MANDATE + the duplicate "no
 * diagrams" lines inside SERIES_GUARDRAILS). The medium line is
 * preset-aware: craft-medium presets (e.g. tactile-diorama) keep their
 * craft framing rather than fighting it with a "must be photorealistic"
 * directive.
 */
function buildSubjectMandateBlock(domain: string, isCraftMedium: boolean): string {
  const mediumLine = isCraftMedium
    ? `## Photorealism mandate
Render the subject in the craft medium described under "Series style" below — that medium is the realism standard for this series. The output should still look like a real, finished in-domain example (a credible chair, a credible loaf, a credible fish), captured by a real camera under believable light, even when the medium is paper, clay, or another tactile material. Do not switch to an allegory, sketch, painting, conceptual poster, generic landscape, generic architecture, or unrelated object.`
    : `## Photorealism mandate
Create a photorealistic image of the exact map subject, not a loosely related scene. Even when the coordinate is speculative, the output should look like a real in-domain thing photographed under believable light with convincing optics, scale cues, surface texture, and environmental context. Do not make an allegory, warning image, surreal contradiction, fantasy failure, diagram, sketch, painting, conceptual poster, generic landscape, generic architecture, or unrelated object.`;

  return `## Subject-object mandate (read first, overrides everything)
Render the subject for this map cell itself, not the map, not a chart, not a diagram, not an infographic, and not a "visualization of the cell" or of the axes. The map exists only to tell you what kind of subject to render and which coordinates it must satisfy. If the domain is ${domain}, the image must be a ${domain} subject — never the matrix, never axes, never a legend, never callouts.

${mediumLine}`;
}

/**
 * Series guardrails focused on framing, subject density, and frontier-cell
 * behavior. Duplicated "no diagrams / no text" lines moved into the subject
 * mandate; framing and frontier rules remain here.
 */
const SERIES_GUARDRAILS = `## Series guardrails (mandatory)
Every image in this map must read as part of one coherent series.
- Keep the exact same medium, palette logic, lighting logic, texture, and overall visual language for every cell in this map.
- One primary subject only. Supporting habitat or environmental context is allowed only when it strengthens the subject and stays secondary.
- The primary subject should fill roughly 60-80% of the frame. Avoid tiny-subject / huge-landscape compositions.
- Favor a strong silhouette, one decisive pose, and a camera distance that makes the coordinate-defining traits readable even at thumbnail size.
- No text inside the image: no labels, captions, titles, logos, watermarks, UI, legends, or callouts.
- Never default to a retail catalog, e-commerce, or seamless studio product-shot look unless the chosen series style explicitly asks for it.
- Frontier cells, including impossible cells, should look like complete viable examples. Do not illustrate absence, impossibility, tension, blockage, failure, collapse, incompleteness, instability, or non-coherence.
- For impossible cells, translate the blocking rule into small visible assumptions that keep the exact same subject category plausible. Do not switch to an adjacent domain, metaphor, technology demo, landscape, building, machine, or human scene unless that is the actual map domain.
- Materials, anatomy, scale cues, and textures should stay believable for the domain even when the cell is frontier-grade.`;

function formatSubjectLock(document: MapDocument, cell: MapCell) {
  const coordinates = Object.entries(cell.coordinates)
    .map(([key, val]) => {
      const dim = document.dimensions.find((d) => d.key === key);
      return `${dim?.label ?? key} = ${val}`;
    })
    .join("; ");

  return `The image must be a ${document.domain} subject for "${cell.label}" and must visibly satisfy these coordinates: ${coordinates}. If the model is unsure, render the closest direct or adjacent visual example and alter only the coordinate-defining visible traits.`;
}

function formatCoordinateCoverageLines(document: MapDocument, cell: MapCell) {
  return Object.entries(cell.coordinates)
    .map(([key, val]) => {
      const dim = document.dimensions.find((d) => d.key === key);
      const label = dim?.label ?? key;
      const desc = dim?.description ? ` ${dim.description}` : "";
      return `- ${label} = ${val}: the visible carrier of "${label}" must appear in the frame and clearly show "${val}".${desc ? ` Context: ${desc}` : ""}`;
    })
    .join("\n");
}

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
  },
): string {
  const grounding = options?.grounding ?? buildCellVisualGroundingBundle(document, cell);
  const series = resolveMapVisualSeries(document);
  const { narrative, coordLines, statusBrief, explanation } = buildPromptContext(document, cell, detailed, grounding);
  const plausibilityConstruction = plausibilityConstructionFor(cell);
  const subjectLock = formatSubjectLock(document, cell);
  const coordinateCoverageLines = formatCoordinateCoverageLines(document, cell);
  const imageLead = detailed
    ? "Generate a single square image for this map cell. No text, logos, watermarks, or typography inside the image."
    : "Generate a single square image for this map cell. No text inside the image.";
  const contextBlock = detailed
    ? `## Map context (for concept selection only — do not render the map)
- Title: ${document.title}
- Domain: ${document.domain} · Family: ${document.topicFamily}
- Series preset: ${series.label}
- One-line summary: ${narrative || "(No summary — infer from coordinates.)"}`
    : `## Map context (for concept selection only — do not render the map)
${document.title} · domain: ${document.domain} · family: ${document.topicFamily} · series: ${series.label}`;

  const focusLine =
    grounding.focusDirectives[0]?.trim() ||
    "Favor one strong, inspectable subject with a clear silhouette and restrained supporting context.";

  const subjectMandateBlock = buildSubjectMandateBlock(document.domain, Boolean(series.isCraftMedium));

  return `${imageLead}

${subjectMandateBlock}

${series.promptBlock}

${SERIES_GUARDRAILS}

${contextBlock}

## Exact subject lock
- ${subjectLock}
- Unrelated output is a failure: do not render a different category, a vibe, a metaphor, a general scene, or a pretty object that merely fits the words.
- Composite subjects must remain complete. If the map subject combines multiple objects, ingredients, parts, or materials, show all coordinate-bearing parts in one coherent image; a partial image fails. For example, an eggs-and-ham cell must show the egg/yolk and the ham/meat, not only ham and not only egg.

## This cell's coordinates
${coordLines}

## Coordinate coverage checklist
${coordinateCoverageLines}
- Every coordinate above must be visible in the final image. Do not crop out, hide, imply, substitute, or leave off any coordinate carrier.
- Show every coordinate-bearing object, ingredient, part, or material needed to read the grid cell in one coherent composition.

## Grounded visual examples to copy from conceptually
${formatGroundingCueLines(grounding.directEvidence, detailed ? 4 : 2)}

## Adjacent visual examples to borrow from
${formatGroundingCueLines(grounding.neighborEvidence, detailed ? 6 : 3)}
- Use other visual examples as the main source of truth: direct evidence first, adjacent anchors second, and the cell note only as a constraint to satisfy. Do not collage them or paste multiple views together.

## Persisted visual references available to you
${formatReferenceImageLines(grounding)}

## About this frontier cell
- Label: ${cell.label}
- Status: ${cell.status}
- ${statusBrief}
${explanation ? `- Cell note to reinterpret visually, not illustrate literally: ${explanation}` : ""}

## Plausibility construction
- ${plausibilityConstruction}
- Treat the coordinates as required visible traits, and make the final subject look like a credible photographed example rather than a comment on whether the map says it exists.

## Composition hint
- ${focusLine}

## Reminder (do not forget)
- Render the subject, not the matrix or axes.
- Stay inside the ${document.domain} domain; square 1:1 framing.
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

function buildImageInputContent(prompt: string, grounding: VisualGroundingBundle): ChatMessageContentPart[] {
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

  const notes = grounding.referenceImages.length
    ? grounding.referenceImages
        .slice(0, 4)
        .map((image, index) => `- Ref ${index + 1}: ${image.reason}${image.title ? ` · ${image.title}` : ""}`)
        .join("\n")
    : "- No external reference images are attached for this draft.";

  parts.push({
    type: "text",
    text: `Reference notes:\n${notes}`,
  });

  return parts;
}

async function openRouterImageCompletion(
  apiKey: string,
  content: string | ChatMessageContentPart[],
  model: string,
): Promise<ChatImageResponse> {
  const modalities = openRouterImageModalities(model);
  function bodyFor(userContent: string | ChatMessageContentPart[]) {
    return JSON.stringify({
      model,
      messages: [{ role: "user", content: userContent }],
      modalities,
      stream: false,
      max_tokens: OPENROUTER_IMAGE_MAX_TOKENS,
      temperature: 0.55,
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
  const caption = cell.label.trim();
  for (const choice of payload?.choices ?? []) {
    const message = choice?.message;
    const url = extractGeneratedImageUrl(message);
    if (!url) continue;
    return { imageUrl: url, caption };
  }
  return null;
}

async function generateCellImage(
  apiKey: string,
  document: MapDocument,
  cell: MapCell,
  grounding: VisualGroundingBundle,
  model: string,
  extraPromptSuffix: string,
): Promise<{ result: CellVisualizationResult | null; prompt: string; retried: boolean }> {
  const detailed = shouldUseFullPrompt(cell, grounding);
  const basePrompt = buildCellImagePrompt(document, cell, detailed, { grounding });
  const prompt = extraPromptSuffix ? `${basePrompt}${extraPromptSuffix}` : basePrompt;
  const payload = await openRouterImageCompletion(apiKey, buildImageInputContent(prompt, grounding), model);
  const initial = visualizationFromPayload(payload, cell);
  if (initial) {
    return { result: initial, prompt, retried: false };
  }

  // One retry: model returned text-only or a degenerate placeholder. Add a
  // remediation note so the model knows we want a real image this time, not
  // a description. This is cheap insurance against transient failures.
  const remediationPrompt = `${prompt}

## Remediation (your previous response did not include a usable image)
Return one valid image as the assistant message's image attachment (not as base64 inside text, not as markdown, not as a placeholder). Do not narrate. The image must be at least 512×512 pixels and depict the subject described above.`;

  const retryPayload = await openRouterImageCompletion(
    apiKey,
    buildImageInputContent(remediationPrompt, grounding),
    model,
  );
  const retried = visualizationFromPayload(retryPayload, cell);
  return { result: retried, prompt, retried: true };
}

export async function generateCellVisualizationWithMetrics(
  document: MapDocument,
  cell: MapCell,
  options?: { imageModel?: string; extraPromptSuffix?: string },
): Promise<{ result: CellVisualizationResult | null; metrics: CellVisualizationMetrics; imageModel: string; prompt?: string }> {
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

  const rawRequested = typeof options?.imageModel === "string" ? options.imageModel.trim() : "";
  const model = resolveRequestedImageModel(rawRequested || undefined);
  if (rawRequested !== "" && model !== rawRequested) {
    metrics.fallbackImageModelUsed = true;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    metrics.wallTimeMsTotal = Date.now() - wall0;
    return { result: null, metrics, imageModel: model };
  }

  const openRouterApiKey = apiKey;
  const grounding = buildCellVisualGroundingBundle(document, cell);

  try {
    metrics.imageGenerationCalls = 1;
    const { result, prompt, retried } = await generateCellImage(
      openRouterApiKey,
      document,
      cell,
      grounding,
      model,
      options?.extraPromptSuffix ?? "",
    );
    if (retried) {
      metrics.imageGenerationCalls = 2;
      metrics.repairAttempts = 1;
    }
    metrics.wallTimeMsTotal = Date.now() - wall0;
    return { result, metrics, imageModel: model, prompt };
  } catch (error) {
    metrics.wallTimeMsTotal = Date.now() - wall0;
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function generateCellVisualizationImage(
  document: MapDocument,
  cell: MapCell,
  options?: { imageModel?: string },
): Promise<CellVisualizationResult | null> {
  const { result } = await generateCellVisualizationWithMetrics(document, cell, options);
  return result;
}
