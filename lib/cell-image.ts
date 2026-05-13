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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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

function formatCoordinateInline(document: MapDocument, cell: MapCell): string {
  return Object.entries(cell.coordinates)
    .map(([key, val]) => {
      const dim = document.dimensions.find((d) => d.key === key);
      return `${dim?.label ?? key} = ${val}`;
    })
    .join("; ");
}

function formatCoordinateCoverageLines(document: MapDocument, cell: MapCell): string {
  return Object.entries(cell.coordinates)
    .map(([key, val]) => {
      const dim = document.dimensions.find((d) => d.key === key);
      const label = dim?.label ?? key;
      const desc = dim?.description ? ` Context: ${dim.description}` : "";
      return `- ${label} = ${val}: the visible carrier of "${label}" must appear in the frame and clearly show "${val}".${desc}`;
    })
    .join("\n");
}

function statusBriefFor(cell: MapCell): string {
  switch (cell.status) {
    case "gap":
      return "Frontier cell — synthesize a credible, complete in-domain subject from the coordinates. Render it as a real example, not as a depiction of absence.";
    case "tension":
      return "Hard-but-viable edge case — render a finished in-domain example under specific visual assumptions; do not dramatize tension.";
    case "impossible":
      return "Stay in-domain and make the minimum visible assumptions needed for the coordinates to coexist. Do not show impossibility, tension, failure, or collapse.";
    case "rare":
      return "Render a documented long-tail instance, or a grounded photorealistic example consistent with nearby anchors.";
    default:
      return "Render one canonical photorealistic instance at these exact coordinates.";
  }
}

function frontierAvoidLine(cell: MapCell): string | null {
  if (cell.status === "gap" || cell.status === "tension" || cell.status === "impossible") {
    return "Render a complete, believable example. Do not illustrate absence, impossibility, tension, blockage, failure, or collapse.";
  }
  return null;
}

function buildReferenceLines(grounding: VisualGroundingBundle): string | null {
  const hasAttached = grounding.referenceImages.length > 0;
  const neighbors = grounding.neighborEvidence
    .map((cue) => cue.name)
    .filter(Boolean)
    .slice(0, 2);

  const lines: string[] = [];
  if (hasAttached) {
    lines.push(
      "- The attached reference images are grounding for anatomy, materials, texture, lighting, and context only. Do not copy their composition or substitute their subject for the one above.",
    );
  } else if (neighbors.length) {
    lines.push(
      `- Cells like ${neighbors.join(", ")} share parts of these coordinates — borrow medium, material, and lighting language from them, not their subject.`,
    );
  }
  return lines.length ? lines.join("\n") : null;
}

export function buildCellImagePrompt(
  document: MapDocument,
  cell: MapCell,
  options?: {
    grounding?: VisualGroundingBundle;
  },
): string {
  const grounding = options?.grounding ?? buildCellVisualGroundingBundle(document, cell);
  const series = resolveMapVisualSeries(document);
  const coordsInline = formatCoordinateInline(document, cell);
  const coverageLines = formatCoordinateCoverageLines(document, cell);
  const statusBrief = statusBriefFor(cell);
  const referenceBlock = buildReferenceLines(grounding);
  const isComposite = Object.keys(cell.coordinates).length >= 2;

  const subjectLines = [
    `Render a ${document.domain} subject for "${cell.label}". The image must visibly satisfy: ${coordsInline}.`,
    `- ${statusBrief}`,
  ];
  if (isComposite) {
    subjectLines.push(
      "- Composite subjects must remain complete: show every coordinate-bearing object, ingredient, part, or material in one coherent composition (an eggs-and-ham cell must show the egg/yolk and the ham/meat together, not just one).",
    );
  }

  const avoidLines = [
    "- No text, labels, callouts, diagrams, charts, infographics, legends, logos, watermarks, or matrices inside the image.",
    "- No retail catalog, e-commerce, or sterile studio backdrop unless the Style block asks for it.",
  ];
  const frontierAvoid = frontierAvoidLine(cell);
  if (frontierAvoid) avoidLines.push(`- ${frontierAvoid}`);

  const sections: string[] = [
    "Generate one square image for this map cell. No text, logos, or watermarks inside the image.",
    `## Subject\n${subjectLines.join("\n")}`,
    `## Coordinate coverage\n${coverageLines}\nEvery coordinate above must be visible; do not crop out, hide, imply, or substitute any coordinate carrier.`,
    series.promptBlock,
  ];
  if (referenceBlock) {
    sections.push(`## References\n${referenceBlock}`);
  }
  sections.push(`## Avoid\n${avoidLines.join("\n")}`);

  return sections.join("\n\n");
}

function buildImageInputContent(prompt: string, grounding: VisualGroundingBundle): ChatMessageContentPart[] {
  const parts: ChatMessageContentPart[] = [{ type: "text", text: prompt }];
  for (const image of grounding.referenceImages.slice(0, 4)) {
    parts.push({
      type: "image_url",
      image_url: { url: image.url },
    });
  }
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

function extractUsage(payload: ChatImageResponse): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
  const u = payload.usage;
  if (!u) return null;
  const p = u.prompt_tokens ?? 0;
  const c = u.completion_tokens ?? 0;
  const t = u.total_tokens ?? (p + c);
  if (p === 0 && c === 0 && t === 0) return null;
  return { promptTokens: p, completionTokens: c, totalTokens: t };
}

function mergeUsage(
  a: { promptTokens: number; completionTokens: number; totalTokens: number } | null,
  b: { promptTokens: number; completionTokens: number; totalTokens: number } | null,
): { promptTokens: number; completionTokens: number; totalTokens: number } | null {
  if (!a && !b) return null;
  const pa = a?.promptTokens ?? 0;
  const pb = b?.promptTokens ?? 0;
  const ca = a?.completionTokens ?? 0;
  const cb = b?.completionTokens ?? 0;
  const ta = a?.totalTokens ?? 0;
  const tb = b?.totalTokens ?? 0;
  return { promptTokens: pa + pb, completionTokens: ca + cb, totalTokens: ta + tb };
}

async function generateCellImage(
  apiKey: string,
  document: MapDocument,
  cell: MapCell,
  grounding: VisualGroundingBundle,
  model: string,
  extraPromptSuffix: string,
): Promise<{
  result: CellVisualizationResult | null;
  prompt: string;
  retried: boolean;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}> {
  const basePrompt = buildCellImagePrompt(document, cell, { grounding });
  const prompt = extraPromptSuffix ? `${basePrompt}${extraPromptSuffix}` : basePrompt;
  const payload = await openRouterImageCompletion(apiKey, buildImageInputContent(prompt, grounding), model);
  const initial = visualizationFromPayload(payload, cell);
  const usage1 = extractUsage(payload);
  if (initial) {
    return { result: initial, prompt, retried: false, usage: usage1 };
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
  const usage2 = extractUsage(retryPayload);
  return { result: retried, prompt, retried: true, usage: mergeUsage(usage1, usage2) };
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
    const { result, prompt, retried, usage } = await generateCellImage(
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
    if (usage) {
      metrics.promptTokens = usage.promptTokens;
      metrics.completionTokens = usage.completionTokens;
      metrics.totalTokens = usage.totalTokens;
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
