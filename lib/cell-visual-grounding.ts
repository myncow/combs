import { resolveMapVisualSeries } from "@/lib/visual-series";
import type { MapCell, MapDocument, MapExample, MapReferenceImage, MapVisualStyleSpec } from "@/lib/types";

export type GroundingExampleCue = {
  kind: "direct" | "neighbor";
  name: string;
  coordinatesLabel: string;
  sharedAxisLabels: string[];
  note: string;
};

export type GroundingImageCue = {
  url: string;
  title?: string;
  source?: string;
  reason: string;
};

export type VisualGroundingBundle = {
  styleSpec: MapVisualStyleSpec;
  narrative: string;
  directEvidence: GroundingExampleCue[];
  neighborEvidence: GroundingExampleCue[];
  referenceImages: GroundingImageCue[];
  focusDirectives: string[];
};

function collapseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function coordinateLabel(document: MapDocument, coordinates: Record<string, string>) {
  return Object.entries(coordinates)
    .map(([key, value]) => {
      const dimension = document.dimensions.find((item) => item.key === key);
      return `${dimension?.label ?? key}: ${value}`;
    })
    .join(" · ");
}

function exampleVisualNote(example: MapExample) {
  return collapseWhitespace([example.description, example.evidenceNote].filter(Boolean).join(" ")).slice(0, 220);
}

function toExampleCue(
  document: MapDocument,
  example: MapExample,
  kind: "direct" | "neighbor",
  sharedAxisLabels: string[],
): GroundingExampleCue {
  return {
    kind,
    name: example.name,
    coordinatesLabel: coordinateLabel(document, example.coordinates),
    sharedAxisLabels,
    note: exampleVisualNote(example) || "Named anchor for this coordinate family.",
  };
}

function sharedAxisLabels(document: MapDocument, cell: MapCell, other: MapCell) {
  return document.dimensions
    .filter((dimension) => cell.coordinates[dimension.key] === other.coordinates[dimension.key])
    .map((dimension) => dimension.label);
}

function isAnchorCell(cell: MapCell) {
  return cell.status === "existing" || cell.status === "rare";
}

function neighborAnchorCells(document: MapDocument, cell: MapCell) {
  return document.cells
    .filter((candidate) => candidate.id !== cell.id)
    .filter(isAnchorCell)
    .map((candidate) => ({
      cell: candidate,
      sharedAxisLabels: sharedAxisLabels(document, cell, candidate),
    }))
    .filter((candidate) => candidate.sharedAxisLabels.length > 0)
    .sort((a, b) => {
      if (b.sharedAxisLabels.length !== a.sharedAxisLabels.length) {
        return b.sharedAxisLabels.length - a.sharedAxisLabels.length;
      }
      return (b.cell.confidence ?? 0) - (a.cell.confidence ?? 0);
    });
}

function dedupeByUrl(images: GroundingImageCue[]) {
  const seen = new Set<string>();
  const result: GroundingImageCue[] = [];

  for (const image of images) {
    const key = image.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(image);
  }

  return result;
}

function referenceImagesFromExample(
  example: MapExample,
  reason: string,
  limit: number,
): GroundingImageCue[] {
  return (example.referenceImages ?? [])
    .filter((image): image is MapReferenceImage & { link: string } => Boolean(image.link))
    .slice(0, limit)
    .map((image) => ({
      url: image.link,
      title: image.title,
      source: image.source,
      reason,
    }));
}

export function buildCellVisualGroundingBundle(document: MapDocument, cell: MapCell): VisualGroundingBundle {
  const narrative = collapseWhitespace([document.summary, document.intro].filter(Boolean).join(" ")).slice(0, 500);
  const styleSpec = resolveMapVisualSeries(document).styleSpec;

  // Frontier (gap) cells have no documented direct evidence by definition —
  // any examples attached to them came from the post-hoc visual probe and
  // are search candidates, not anchors. Calling them "Direct evidence" in
  // the prompt causes the model to lift them as the subject. Treat them as
  // ambient reference imagery only and surface no `directEvidence` cues.
  const isFrontierCell = cell.status === "gap";
  const directEvidence = isFrontierCell
    ? []
    : cell.examples.slice(0, 3).map((example) => toExampleCue(document, example, "direct", []));

  const neighborCells = neighborAnchorCells(document, cell).slice(0, 4);
  const neighborEvidence = neighborCells
    .flatMap(({ cell: neighbor, sharedAxisLabels }) =>
      neighbor.examples.slice(0, 2).map((example) => toExampleCue(document, example, "neighbor", sharedAxisLabels)),
    )
    .slice(0, 6);

  const referenceImages = dedupeByUrl([
    ...cell.examples.flatMap((example) =>
      referenceImagesFromExample(
        example,
        isFrontierCell
          ? `Ambient search candidate for "${cell.label}" — use for material/texture/lighting language only, not as the subject`
          : `Direct evidence from ${example.name}`,
        2,
      ),
    ),
    ...neighborCells.flatMap(({ cell: neighbor, sharedAxisLabels }) =>
      neighbor.examples.flatMap((example) =>
        referenceImagesFromExample(
          example,
          `Neighbor anchor from ${example.name}${sharedAxisLabels.length ? ` sharing ${sharedAxisLabels.join(" + ")}` : ""}`,
          1,
        ),
      ),
    ),
  ]).slice(0, 6);

  const focusDirectives = [
    directEvidence.length
      ? `Anchor the subject in the documented cues from ${directEvidence
          .map((cue) => cue.name)
          .slice(0, 2)
          .join(", ")}.`
      : isFrontierCell
        ? "No documented anchor sits at this exact intersection — synthesise the subject from the coordinate constraints and the neighbouring anchor language. Treat any attached references as ambient material/lighting cues only."
        : "",
    neighborEvidence.some((cue) => cue.sharedAxisLabels.length)
      ? `Borrow structure, setting, or process cues from adjacent anchor cells that share ${Array.from(
          new Set(neighborEvidence.flatMap((cue) => cue.sharedAxisLabels)),
        )
          .slice(0, 2)
          .join(" and ")}.`
      : "",
    referenceImages.length
      ? "Use the attached reference images for anatomy, materials, and context only; do not collage or copy their composition literally."
      : "Stay faithful to believable anatomy, materials, and context even when the coordinate is speculative.",
  ].filter(Boolean);

  return {
    styleSpec,
    narrative,
    directEvidence,
    neighborEvidence,
    referenceImages,
    focusDirectives,
  };
}
