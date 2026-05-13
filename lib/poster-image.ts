/**
 * Map poster generation. Builds a single composite prompt + (optional)
 * grounding image references for an entire map, asks an image model to
 * lay it out as a poster, and returns the URL of the persisted artwork.
 *
 * Why this lives alongside `cell-image.ts` rather than calling into it:
 *   - The cell pipeline is tuned for one square subject per call with a
 *     small grounding bundle. Posters need a multi-cell layout brief
 *     plus a discard-mismatched-references protection clause that does
 *     not apply to individual cells.
 *   - Keeping it isolated lets us iterate on poster style without
 *     accidentally drifting cell-level rendering.
 */
import { appConfig, CELL_IMAGE_MODEL, resolveRequestedImageModel } from "@/lib/config";
import { resolveMapVisualSeries } from "@/lib/visual-series";
import type { MapCell, MapDocument, MapExample } from "@/lib/types";

const POSTER_MAX_REFERENCE_IMAGES = 12;
const OPENROUTER_IMAGE_MAX_TOKENS = 8192;

type ChatTextPart = { type: "text"; text: string };
type ChatImagePart = { type: "image_url"; image_url: { url: string } };
type ChatMessageContentPart = ChatTextPart | ChatImagePart;

type ChatImageResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      images?: unknown;
    };
  }>;
  error?: { message?: string };
};

export type PosterCellAnchor = {
  cell: MapCell;
  referenceUrl: string | null;
  exampleName: string | null;
  /**
   * Best subject text — falls back through example name → cell label →
   * a coordinate descriptor. Always non-empty so the prompt is never
   * forced to refer to a cell with just an index.
   */
  subject: string;
};

export type PosterPromptBuild = {
  prompt: string;
  anchors: PosterCellAnchor[];
  /** Anchors with a usable reference image URL, in attachment order. */
  imageAnchors: PosterCellAnchor[];
};

function exampleHasReferenceImage(ex: MapExample | null | undefined): boolean {
  if (!ex) return false;
  return (ex.referenceImages ?? []).some(
    (img) => typeof img?.link === "string" && img.link.length > 0,
  );
}

function pickReferenceImageUrl(ex: MapExample): string | null {
  const ref = (ex.referenceImages ?? []).find(
    (img) => typeof img?.link === "string" && img.link.length > 0,
  );
  if (!ref) return null;
  return ref.link ?? ref.thumbnail ?? null;
}

function pickAnchorForCell(cell: MapCell): {
  referenceUrl: string | null;
  exampleName: string | null;
} {
  // Prefer a generated cell visualization — those have already passed
  // our own subject coverage checks, so they're the most faithful to
  // the cell. Falls back to the first SerpAPI reference image. If the
  // cell has nothing, return null so the prompt asks the model to
  // synthesize from the textual description.
  if (cell.visualization?.imageUrl) {
    return {
      referenceUrl: cell.visualization.imageUrl,
      exampleName: cell.visualization.caption ?? cell.label,
    };
  }
  const example = cell.examples.find(exampleHasReferenceImage) ?? cell.examples[0];
  if (example) {
    return {
      referenceUrl: pickReferenceImageUrl(example),
      exampleName: example.name,
    };
  }
  return { referenceUrl: null, exampleName: null };
}

function coordinateDescriptor(document: MapDocument, cell: MapCell): string {
  return Object.entries(cell.coordinates)
    .map(([key, val]) => {
      const dim = document.dimensions.find((d) => d.key === key);
      return `${dim?.label ?? key} = ${val}`;
    })
    .join("; ");
}

function gridShape(document: MapDocument): { rows: number; cols: number; rowsLabel: string; colsLabel: string } {
  const dims = document.dimensions.slice(0, 2);
  // X axis = first dimension (column), Y axis = second (row). When the
  // document has only one dimension we treat its values as a single
  // horizontal strip so the prompt does not invent a phantom axis.
  const [xDim, yDim] = dims;
  const cols = xDim?.values.length ?? 1;
  const rows = yDim?.values.length ?? 1;
  return {
    rows,
    cols,
    rowsLabel: yDim?.label ?? "rows",
    colsLabel: xDim?.label ?? "columns",
  };
}

/**
 * Builds an ordered list of cells matching the visual reading order
 * (left-to-right, top-to-bottom over the two primary axes). Cells whose
 * coordinates fall outside the first two dimensions sort by their
 * appearance order in the document.
 */
function orderCells(document: MapDocument): MapCell[] {
  const [xDim, yDim] = document.dimensions;
  if (!xDim || !yDim) return document.cells.slice();
  const colOrder = new Map(xDim.values.map((v, i) => [v, i]));
  const rowOrder = new Map(yDim.values.map((v, i) => [v, i]));
  return document.cells
    .slice()
    .sort((a, b) => {
      const ay = rowOrder.get(a.coordinates[yDim.key] ?? "") ?? 999;
      const by = rowOrder.get(b.coordinates[yDim.key] ?? "") ?? 999;
      if (ay !== by) return ay - by;
      const ax = colOrder.get(a.coordinates[xDim.key] ?? "") ?? 999;
      const bx = colOrder.get(b.coordinates[xDim.key] ?? "") ?? 999;
      return ax - bx;
    });
}

export function buildPosterAnchors(document: MapDocument): PosterCellAnchor[] {
  const ordered = orderCells(document);
  return ordered.map((cell) => {
    const { referenceUrl, exampleName } = pickAnchorForCell(cell);
    const subject = exampleName?.trim() || cell.label || coordinateDescriptor(document, cell);
    return { cell, referenceUrl, exampleName, subject };
  });
}

export function buildPosterPrompt(document: MapDocument): PosterPromptBuild {
  const anchors = buildPosterAnchors(document);
  // Only the first N anchors with images get attached — keeps the
  // multimodal payload under typical provider limits and prevents one
  // visually noisy cell from dominating the model's attention.
  const imageAnchors = anchors.filter((a) => a.referenceUrl).slice(0, POSTER_MAX_REFERENCE_IMAGES);
  const imageAnchorIndexByCellId = new Map(
    imageAnchors.map((a, i) => [a.cell.id, i + 1]),
  );

  const { rows, cols, rowsLabel, colsLabel } = gridShape(document);
  const visual = resolveMapVisualSeries(document);

  const cellLines = anchors.map((anchor, idx) => {
    const number = idx + 1;
    const refIndex = imageAnchorIndexByCellId.get(anchor.cell.id);
    const coords = coordinateDescriptor(document, anchor.cell);
    const subject = anchor.subject;
    const sourceClause = refIndex
      ? `Reference image #${refIndex} is attached — use it as the visual anchor for this tile.`
      : "No reference image is available — synthesize this tile entirely from the description.";
    return `${number}. "${anchor.cell.label}" (${coords}) — subject: ${subject}. ${sourceClause}`;
  });

  const axisBlock = (() => {
    const [xDim, yDim] = document.dimensions;
    const parts: string[] = [];
    if (xDim) {
      parts.push(
        `- X axis (${xDim.label}, left → right): ${xDim.values.join(" · ")}`,
      );
    }
    if (yDim) {
      parts.push(
        `- Y axis (${yDim.label}, top → bottom): ${yDim.values.join(" · ")}`,
      );
    }
    return parts.length ? parts.join("\n") : "(single linear strip)";
  })();

  const styleHint = visual?.styleSpec
    ? [
        `Medium: ${visual.styleSpec.medium}.`,
        `Composition (per tile): ${visual.styleSpec.composition}.`,
        `Background: ${visual.styleSpec.background}.`,
        `Lighting: ${visual.styleSpec.lighting}.`,
        `Palette: ${visual.styleSpec.palette}.`,
        `Surface feel: ${visual.styleSpec.surfaceFeel}.`,
      ].join(" ")
    : "Editorial natural-history plate aesthetic. Calm, consistent lighting across all tiles. Restrained palette.";

  const sections: string[] = [
    `Generate a single poster image that lays out a ${rows}×${cols} grid of subjects for the topic "${document.title}" (${document.domain}).`,
    `## Poster layout
- The image is a single composite poster, **not** a contact sheet of separate frames. Tiles share a poster background and a thin uniform gutter.
- Top header strip carries the title "${document.title}" in compact serif/sans display type; axes are labelled along the outside edges only.
- Inner grid is exactly ${rows} rows × ${cols} columns (${rows * cols} tiles). Reading order is left-to-right, top-to-bottom.
- ${rowsLabel} runs down the left edge; ${colsLabel} runs across the top edge. Tile order in the list below matches that reading order.
- Each tile is a self-contained illustration of its subject — no captions inside tiles, no axis labels inside tiles.`,
    `## Axes\n${axisBlock}`,
    `## Tiles (in reading order)\n${cellLines.join("\n")}`,
    `## Style\n${styleHint}`,
    `## Reference image protections
- Reference images are attached **in the order listed** above (image #1 → first tile with a reference, image #2 → next, etc.).
- Treat each reference as a non-authoritative anchor: borrow its subject's anatomy, materials, scale, era, and posture for the tile it is paired with.
- **Discard mismatched references.** If an attached reference does not depict the described subject — wrong species, wrong era, off-topic stock photo, a person when the cell describes an object, a UI screenshot, a chart, a watermark-heavy retail listing — ignore it entirely and synthesize that tile from the written description alone. Do **not** carry the wrong subject into the tile just because an image was attached.
- Never copy a reference's frame, watermark, label, brand mark, or background environment verbatim.`,
    `## Avoid
- No empty tiles, no placeholder "image not found" graphics, no broken-image icons.
- No text inside any tile beyond what is part of the depicted subject in the real world.
- No legends, captions, scale bars, charts, or matrices inside tiles.
- Do not duplicate a tile or leave one as a black/white square — every position in the grid must show a finished illustration of its listed subject.`,
  ];

  return {
    prompt: sections.join("\n\n"),
    anchors,
    imageAnchors,
  };
}

function buildPosterInputContent(build: PosterPromptBuild): ChatMessageContentPart[] {
  const parts: ChatMessageContentPart[] = [{ type: "text", text: build.prompt }];
  for (const anchor of build.imageAnchors) {
    if (!anchor.referenceUrl) continue;
    parts.push({ type: "image_url", image_url: { url: anchor.referenceUrl } });
  }
  return parts;
}

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

function extractGeneratedImageUrl(payload: ChatImageResponse): string | null {
  for (const choice of payload?.choices ?? []) {
    const message = choice?.message;
    if (!message) continue;
    const fromList = (message as { images?: unknown }).images;
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
  }
  return null;
}

function openRouterImageModalities(model: string): ("image" | "text")[] {
  const id = model.toLowerCase();
  if (id.startsWith("black-forest-labs/") || id.startsWith("bytedance-seed/") || id.startsWith("sourceful/")) {
    return ["image"];
  }
  return ["image", "text"];
}

async function callOpenRouterPosterImage(
  apiKey: string,
  content: ChatMessageContentPart[],
  model: string,
): Promise<ChatImageResponse> {
  const modalities = openRouterImageModalities(model);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": appConfig.openRouter.siteUrl,
    "X-Title": `${appConfig.openRouter.appHttpTitle} Poster`,
  };
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content }],
    modalities,
    stream: false,
    max_tokens: OPENROUTER_IMAGE_MAX_TOKENS,
    temperature: 0.5,
  });
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body,
  });
  const payload = (await response.json().catch(() => null)) as ChatImageResponse | null;
  if (!response.ok) {
    const message = payload?.error?.message ?? `Poster image request failed (${response.status})`;
    throw new Error(message);
  }
  return payload ?? {};
}

export type GenerateMapPosterResult = {
  /** Data URL or remote URL of the generated poster. Caller is expected to
   *  persist it via `materializeMapPoster` before storing on the map row. */
  imageUrl: string;
  prompt: string;
  model: string;
  anchorCount: number;
};

/**
 * Generate a single poster image for the entire map. Throws when the
 * upstream model returns no usable image — callers should surface the
 * error to the UI so the user can retry.
 */
export async function generateMapPoster(
  document: MapDocument,
  options?: { imageModel?: string },
): Promise<GenerateMapPosterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Poster generation requires OPENROUTER_API_KEY.");
  }
  const model = resolveRequestedImageModel(options?.imageModel ?? CELL_IMAGE_MODEL);

  const build = buildPosterPrompt(document);
  const content = buildPosterInputContent(build);

  const payload = await callOpenRouterPosterImage(apiKey, content, model);
  const imageUrl = extractGeneratedImageUrl(payload);
  if (!imageUrl) {
    throw new Error(
      "Poster model returned no usable image. The provider may be temporarily rate-limited; please retry.",
    );
  }

  return {
    imageUrl,
    prompt: build.prompt,
    model,
    anchorCount: build.imageAnchors.length,
  };
}
