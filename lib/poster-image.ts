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

  const subjectTreatment = visual?.styleSpec
    ? [
        `Medium: ${visual.styleSpec.medium}`,
        `Per-tile composition: ${visual.styleSpec.composition}`,
        `Per-tile background: ${visual.styleSpec.background}`,
        `Lighting recipe: ${visual.styleSpec.lighting}`,
        `Palette: ${visual.styleSpec.palette}`,
        `Surface feel: ${visual.styleSpec.surfaceFeel}`,
      ].join(". ") + "."
    : "Photographic study of the subject with calm natural light, restrained palette, and tactile surface detail.";

  const sections: string[] = [
    `Generate a single Lelet poster — an engineering-paper plate that lays out a ${rows}×${cols} grid of subjects for "${document.title}" (${document.domain}).`,
    `## Site identity (binding for the poster chrome)
Lelet posters look like one page from a technical reference book, not an editorial magazine spread.
- Outer poster background: pale, cool neutral "engineering paper" — a single flat tone, no gradient, no paper grain, no vignette.
- Grid lines, gutters, axis labels, and title chrome are rendered in graphite ink on paper — hairline weight, perfectly straight, 90° corners.
- One desaturated cobalt accent is permitted, sparingly — for a small tick, a thin underline, or a single axis mark. Never as a tile background or wash.
- No drop shadows anywhere on the poster — not on the title bar, the grid, the tiles, or the gutters. The poster reads as a flat printed plate.
- Square corners throughout. No rounded rectangles on the poster, the tiles, or the title bar.`,
    `## Poster layout
- A single composite poster, **not** a contact sheet of separate frames. Every tile sits on the shared engineering-paper background, separated only by hairline graphite gutters of uniform width.
- Top header strip carries the title "${document.title}" in compact monospace small-caps with low tracking, graphite ink on paper. No serif display type, no script, no all-lowercase.
- Axes are labelled along the outside edges only, in the same monospace small-caps treatment.
  - ${rowsLabel} runs down the left edge, top to bottom.
  - ${colsLabel} runs across the top edge, left to right.
- Inner grid is exactly ${rows} rows × ${cols} columns (${rows * cols} tiles). Reading order is left-to-right, top-to-bottom.
- Each tile is a self-contained illustration of its subject — no captions, axis labels, scale bars, or annotations inside tiles.`,
    `## Tile uniformity (the most important constraint)
The ${rows * cols} tiles must read as a single specimen sheet — same shoot, same day, same camera. The ONLY thing that varies tile-to-tile is the depicted subject.
- Identical lighting direction, intensity, and color temperature across every tile.
- Identical color grade and palette across every tile. No saturation pop on one tile, no warm/cool drift between tiles.
- Identical depth of field and focal-length feel across every tile.
- Identical crop ratio and subject-to-frame size across every tile. If one tile frames its subject at ~70% of the tile, every tile frames its subject at ~70%.
- Identical background treatment across every tile — the same kind of habitat fragment, work surface, or study context. Not a different environment per tile.
- Treat the grid as ONE coherent plate, not ${rows * cols} independent renders.`,
    `## Axes\n${axisBlock}`,
    `## Tiles (in reading order)\n${cellLines.join("\n")}`,
    `## Per-tile subject treatment\n${subjectTreatment}`,
    `## Reference image protections
- Reference images are attached **in the order listed** above (image #1 → first tile with a reference, image #2 → next, etc.).
- Treat each reference as a non-authoritative anchor: borrow its subject's anatomy, materials, scale, era, and posture for the tile it is paired with.
- **Discard mismatched references.** If an attached reference does not depict the described subject — wrong species, wrong era, off-topic stock photo, a person when the cell describes an object, a UI screenshot, a chart, a watermark-heavy retail listing — ignore it entirely and synthesize that tile from the written description alone. Do **not** carry the wrong subject into the tile just because an image was attached.
- Never copy a reference's frame, watermark, label, brand mark, or background environment verbatim.
- Conform every reference-grounded tile to the tile-uniformity contract above (same lighting, same crop, same palette). Do not inherit a reference's lighting or grading.`,
    `## Avoid
- No empty tiles, no placeholder "image not found" graphics, no broken-image icons.
- No text inside any tile beyond what is part of the depicted subject in the real world.
- No legends, captions, scale bars, charts, or matrices inside tiles.
- Do not duplicate a tile or leave one as a black/white square — every position in the grid must show a finished illustration of its listed subject.
- No tile-to-tile drift in lighting, palette, depth of field, crop ratio, or background treatment.
- No editorial/lifestyle/magazine grading, no cinematic vignettes, no HDR halos, no glossy catalog polish.
- No rounded corners, no drop shadows, no decorative borders. The poster is flat reference material.`,
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
    signal: AbortSignal.timeout(90_000),
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
