import { and, asc, desc, eq, ilike, inArray, isNotNull, ne, or, sql, sum } from "drizzle-orm";
import { del as deleteBlob } from "@vercel/blob";
import { materializeCellImageAsset } from "@/lib/cell-visualization-storage";
import { appConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import {
  MAP_TOPIC,
  MAPS_GLOBAL_TOPIC,
  MAPS_USER_TOPIC,
  publish as publishBusEvent,
  type MapEvent,
  type MapsListEvent,
} from "@/lib/server-event-bus";
import {
  cellVisualizationRunsTable,
  mapAxesTable,
  mapAxisValuesTable,
  mapCalloutsTable,
  mapCellBadgesTable,
  mapCellCoordinatesTable,
  mapCellsTable,
  mapConstraintsTable,
  mapExampleReferenceImagesTable,
  mapExamplesTable,
  mapFeaturedExamplesTable,
  mapGenerationRunsTable,
  mapsTable,
  mediaAssetsTable,
  spotlightsTable,
  spotlightVotesTable,
} from "@/lib/db/schema";
import type { GenerationMetrics } from "@/lib/generation-metrics";
import type {
  CellVisualizationRun,
  GenerationRun,
  LeaderboardEntry,
  LeaderboardSort,
  LeaderboardVote,
  LeaderboardVoteDirection,
  ListedLeaderboardEntry,
  MapBrief,
  MapDocument,
  MapExample,
  MapVisibility,
  NormalizedMapBrief,
  SavedMap,
} from "@/lib/types";
import {
  cellVisualizationCost,
  formatUsd,
  SERPAPI_COST_PER_CALL,
  totalLlmCost,
  type MapCostBreakdown,
} from "@/lib/pricing";
import { pickMapThumbnail, slugify } from "@/lib/utils";

type DbLike = any;

/**
 * Fan an event out to per-map listeners and the list-level streams (global +
 * owner). Wrapped so individual mutation sites stay readable; the bus itself
 * isolates handler errors so a faulty subscriber cannot block the writer.
 */
function notifyMap(event: MapEvent): void {
  publishBusEvent<MapEvent>(MAP_TOPIC(event.slug), event);
}

function notifyList(ownerId: string | null, event: MapsListEvent): void {
  publishBusEvent<MapsListEvent>(MAPS_GLOBAL_TOPIC, event);
  if (ownerId) {
    publishBusEvent<MapsListEvent>(MAPS_USER_TOPIC(ownerId), event);
  }
}

function isoNow() {
  return new Date().toISOString();
}

function coerceIsoString(value: unknown, fallback = isoNow()): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

function toBasisPoints(value: number | undefined | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value * 10_000);
}

function fromBasisPoints(value: number | null | undefined) {
  if (typeof value !== "number") return undefined;
  return value / 10_000;
}

function serializeSavedMap(record: SavedMap): SavedMap {
  return {
    ...record,
    thumbnailUrl: pickMapThumbnail(record.document),
  };
}

function serializeLeaderboardEntry<T extends LeaderboardEntry>(record: T): T {
  return {
    ...record,
    createdAt: coerceIsoString(record.createdAt),
    publishedAt: coerceIsoString(record.publishedAt),
  };
}

function buildLeaderboardSlug(mapSlug: string, cellId: string) {
  return slugify(`${mapSlug}-${cellId}`);
}

function attachViewerVote(
  entries: LeaderboardEntry[],
  votes: LeaderboardVote[],
  requesterId?: string,
): ListedLeaderboardEntry[] {
  const byEntryId = new Map<string, LeaderboardVoteDirection | null>();
  if (requesterId) {
    for (const vote of votes) {
      if (vote.requesterId === requesterId) {
        byEntryId.set(vote.entryId, vote.direction);
      }
    }
  }

  return entries.map((entry) => ({
    ...serializeLeaderboardEntry(entry),
    viewerVote: requesterId ? (byEntryId.get(entry.id) ?? null) : null,
  }));
}

function toLeaderboardVote(row: any): LeaderboardVote {
  return {
    entryId: row.entryId ?? row.spotlightId,
    requesterId: row.requesterId,
    direction: row.direction,
    createdAt: coerceIsoString(row.createdAt),
    updatedAt: coerceIsoString(row.updatedAt),
  };
}

function inferAssetProvider(url: string): "public_path" | "external_url" | "vercel_blob" {
  if (url.startsWith("/")) return "public_path";
  if (url.includes(".public.blob.vercel-storage.com")) return "vercel_blob";
  return "external_url";
}

function isInlineDataUrl(url: string) {
  return url.startsWith("data:");
}

type MediaAssetInput = {
  publicUrl: string;
  provider?: "public_path" | "external_url" | "vercel_blob";
  storageKey?: string;
  mimeType?: string;
  byteSize?: number;
  altText?: string;
  byteHash?: string;
};

function normalizeMediaAsset(input: MediaAssetInput): Required<Pick<MediaAssetInput, "publicUrl" | "provider">> &
  Omit<MediaAssetInput, "provider" | "publicUrl"> {
  return {
    publicUrl: input.publicUrl,
    provider: input.provider ?? inferAssetProvider(input.publicUrl),
    storageKey:
      input.storageKey ??
      (input.publicUrl.startsWith("/") ? input.publicUrl : undefined),
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    altText: input.altText,
    byteHash: input.byteHash,
  };
}

function logReadFallback(scope: string, error: unknown) {
  console.error(`[store:${scope}] read fallback`, error);
}

async function ensureMediaAsset(db: DbLike, input: MediaAssetInput) {
  const { publicUrl, provider, storageKey, mimeType, byteSize, altText, byteHash } = normalizeMediaAsset(input);
  const existing = await db
    .select()
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.publicUrl, publicUrl))
    .limit(1);
  if (existing.length) {
    const row = existing[0]!;
    if (
      (altText && row.altText !== altText) ||
      (byteHash && row.byteHash !== byteHash) ||
      (storageKey && row.storageKey !== storageKey) ||
      (mimeType && row.mimeType !== mimeType) ||
      (typeof byteSize === "number" && row.byteSize !== byteSize) ||
      row.provider !== provider
    ) {
      await db
        .update(mediaAssetsTable)
        .set({
          provider,
          storageKey: storageKey ?? row.storageKey,
          mimeType: mimeType ?? row.mimeType,
          byteSize: byteSize ?? row.byteSize,
          altText: altText ?? row.altText,
          byteHash: byteHash ?? row.byteHash,
        })
        .where(eq(mediaAssetsTable.id, row.id));
    }
    return row.id;
  }

  const id = `asset_${crypto.randomUUID()}`;
  await db.insert(mediaAssetsTable).values({
    id,
    provider,
    storageKey: storageKey ?? null,
    publicUrl,
    mimeType: mimeType ?? null,
    byteSize: byteSize ?? null,
    altText: altText ?? null,
    byteHash: byteHash ?? null,
  });
  return id;
}

async function resolveVisualizationMediaAssetInput(
  mapSlug: string,
  cellId: string,
  input: MediaAssetInput,
): Promise<MediaAssetInput> {
  if (!isInlineDataUrl(input.publicUrl)) {
    return input;
  }

  const materialized = await materializeCellImageAsset(mapSlug, cellId, input.publicUrl);
  return {
    publicUrl: materialized.url,
    provider: materialized.provider,
    storageKey: materialized.storageKey,
    mimeType: materialized.mimeType,
    byteSize: materialized.byteSize,
    byteHash: materialized.byteHash,
    altText: input.altText,
  };
}

function findCellByCoordinates(document: MapDocument, coordinates: Record<string, string>) {
  return document.cells.find((cell) =>
    Object.entries(coordinates).every(([key, value]) => cell.coordinates[key] === value),
  );
}

/**
 * Persist `document` against the existing relational rows for `mapId`.
 *
 * Cell `id` is preserved across calls (keyed by `cell_key`) so that cross-table
 * references — most importantly `spotlights.cell_id` (ON DELETE CASCADE) and
 * the spotlight votes hanging off it — survive subsequent edits. Axes,
 * examples, constraints, callouts, and per-cell child rows (badges,
 * coordinates) are wiped and re-inserted because nothing outside the map
 * references their ids; replacing them is simpler than computing a per-row
 * diff and there are no FKs to worry about.
 */
async function syncMapRelations(db: DbLike, mapId: string, document: MapDocument) {
  const existingCellRows = await db
    .select({ id: mapCellsTable.id, cellKey: mapCellsTable.cellKey })
    .from(mapCellsTable)
    .where(eq(mapCellsTable.mapId, mapId));
  const existingCellIdByKey = new Map<string, string>(
    existingCellRows.map((row: any) => [row.cellKey, row.id]),
  );

  const nextCellKeys = new Set(document.cells.map((cell) => cell.id));
  const cellIdsToDelete = existingCellRows
    .filter((row: any) => !nextCellKeys.has(row.cellKey))
    .map((row: any) => row.id);
  if (cellIdsToDelete.length) {
    await db.delete(mapCellsTable).where(inArray(mapCellsTable.id, cellIdsToDelete));
  }

  // Wipe everything outside `map_cells`. Deleting axes cascades through
  // `map_axis_values` and `map_cell_coordinates`; deleting examples cascades
  // through `map_featured_examples` and `map_example_reference_images`.
  await db.delete(mapAxesTable).where(eq(mapAxesTable.mapId, mapId));
  await db.delete(mapExamplesTable).where(eq(mapExamplesTable.mapId, mapId));
  await db.delete(mapConstraintsTable).where(eq(mapConstraintsTable.mapId, mapId));
  await db.delete(mapCalloutsTable).where(eq(mapCalloutsTable.mapId, mapId));

  // Per-cell child rows get re-inserted below, but axes deletion only cleared
  // coordinates — we need to reset badges for cells that survive too.
  const preservedCellIds = document.cells
    .map((cell) => existingCellIdByKey.get(cell.id))
    .filter((id): id is string => typeof id === "string");
  if (preservedCellIds.length) {
    await db.delete(mapCellBadgesTable).where(inArray(mapCellBadgesTable.cellId, preservedCellIds));
  }

  const axisIdByKey = new Map<string, string>();
  const axisValueIdByAxisValue = new Map<string, string>();
  const cellIdByKey = new Map<string, string>();

  for (const [axisIndex, axis] of document.dimensions.entries()) {
    const axisId = `axis_${crypto.randomUUID()}`;
    axisIdByKey.set(axis.key, axisId);
    await db.insert(mapAxesTable).values({
      id: axisId,
      mapId,
      axisKey: axis.key,
      label: axis.label,
      description: axis.description,
      position: axisIndex,
    });
    for (const [valueIndex, value] of axis.values.entries()) {
      const axisValueId = `axis_value_${crypto.randomUUID()}`;
      axisValueIdByAxisValue.set(`${axis.key}:${value}`, axisValueId);
      await db.insert(mapAxisValuesTable).values({
        id: axisValueId,
        axisId,
        label: value,
        position: valueIndex,
      });
    }
  }

  for (const [cellIndex, cell] of document.cells.entries()) {
    const existingCellId = existingCellIdByKey.get(cell.id);
    const cellId = existingCellId ?? `cell_${crypto.randomUUID()}`;
    cellIdByKey.set(cell.id, cellId);

    const visualizationAssetId = cell.visualization?.imageUrl
      ? await ensureMediaAsset(
          db,
          await resolveVisualizationMediaAssetInput(document.slug, cell.id, {
            publicUrl: cell.visualization.imageUrl,
            altText: cell.visualization.caption ?? cell.label,
            byteHash: cell.visualization.byteHash,
          }),
        )
      : null;

    const cellValues = {
      mapId,
      cellKey: cell.id,
      label: cell.label,
      status: cell.status,
      explanation: cell.explanation,
      confidence: toBasisPoints(cell.confidence) ?? 0,
      sortOrder: cellIndex,
      visualizationAssetId,
      visualizationCaption: cell.visualization?.caption ?? null,
      visualizationImageModel: cell.visualization?.imageModel ?? null,
      visualizationPrompt: cell.visualization?.prompt ?? null,
      visualizationByteHash: cell.visualization?.byteHash ?? null,
    };

    if (existingCellId) {
      await db.update(mapCellsTable).set(cellValues).where(eq(mapCellsTable.id, existingCellId));
    } else {
      await db.insert(mapCellsTable).values({ id: cellId, ...cellValues });
    }

    let badgeIndex = 0;
    for (const badge of cell.badges) {
      await db.insert(mapCellBadgesTable).values({
        id: `badge_${crypto.randomUUID()}`,
        cellId,
        label: badge,
        sortOrder: badgeIndex++,
      });
    }

    for (const [axisKey, axisValue] of Object.entries(cell.coordinates)) {
      const axisId = axisIdByKey.get(axisKey);
      const axisValueId = axisValueIdByAxisValue.get(`${axisKey}:${axisValue}`);
      if (!axisId || !axisValueId) continue;
      await db.insert(mapCellCoordinatesTable).values({
        cellId,
        axisId,
        axisValueId,
      });
    }

    for (const [exampleIndex, example] of cell.examples.entries()) {
      const exampleId = `example_${crypto.randomUUID()}`;
      await db.insert(mapExamplesTable).values({
        id: exampleId,
        mapId,
        cellId,
        name: example.name,
        description: example.description,
        status: example.status,
        coordinatesSnapshot: example.coordinates,
        brand: example.brand ?? null,
        year: example.year ?? null,
        evidenceNote: example.evidenceNote ?? null,
        confidence: toBasisPoints(example.confidence),
        sortOrder: exampleIndex,
      });
      for (const [imageIndex, image] of (example.referenceImages ?? []).entries()) {
        await db.insert(mapExampleReferenceImagesTable).values({
          id: `example_image_${crypto.randomUUID()}`,
          exampleId,
          link: image.link,
          thumbnail: image.thumbnail ?? null,
          title: image.title ?? null,
          source: image.source ?? null,
          sortOrder: imageIndex,
        });
      }
    }
  }

  for (const [exampleIndex, example] of document.featuredExamples.entries()) {
    const exampleId = `example_${crypto.randomUUID()}`;
    await db.insert(mapExamplesTable).values({
      id: exampleId,
      mapId,
      cellId: null,
      name: example.name,
      description: example.description,
      status: example.status,
      coordinatesSnapshot: example.coordinates,
      brand: example.brand ?? null,
      year: example.year ?? null,
      evidenceNote: example.evidenceNote ?? null,
      confidence: toBasisPoints(example.confidence),
      sortOrder: exampleIndex,
    });
    await db.insert(mapFeaturedExamplesTable).values({
      mapId,
      exampleId,
      sortOrder: exampleIndex,
    });
    for (const [imageIndex, image] of (example.referenceImages ?? []).entries()) {
      await db.insert(mapExampleReferenceImagesTable).values({
        id: `example_image_${crypto.randomUUID()}`,
        exampleId,
        link: image.link,
        thumbnail: image.thumbnail ?? null,
        title: image.title ?? null,
        source: image.source ?? null,
        sortOrder: imageIndex,
      });
    }
  }

  for (const [constraintIndex, constraint] of document.constraints.entries()) {
    await db.insert(mapConstraintsTable).values({
      id: `constraint_${crypto.randomUUID()}`,
      mapId,
      kind: constraint.kind,
      label: constraint.label,
      explanation: constraint.explanation,
      sortOrder: constraintIndex,
    });
  }

  for (const [calloutIndex, callout] of document.notableGaps.entries()) {
    const matchedCell = findCellByCoordinates(document, callout.coordinates);
    await db.insert(mapCalloutsTable).values({
      id: `callout_${crypto.randomUUID()}`,
      mapId,
      cellId: matchedCell ? cellIdByKey.get(matchedCell.id) ?? null : null,
      kind: "notable_gap",
      label: callout.label,
      explanation: callout.explanation,
      coordinatesSnapshot: callout.coordinates,
      sortOrder: calloutIndex,
    });
  }

  for (const [calloutIndex, callout] of document.impossibleCombos.entries()) {
    const matchedCell = findCellByCoordinates(document, callout.coordinates);
    await db.insert(mapCalloutsTable).values({
      id: `callout_${crypto.randomUUID()}`,
      mapId,
      cellId: matchedCell ? cellIdByKey.get(matchedCell.id) ?? null : null,
      kind: "impossible_combo",
      label: callout.label,
      explanation: callout.explanation,
      coordinatesSnapshot: callout.coordinates,
      sortOrder: calloutIndex,
    });
  }
}

type MapRow = {
  id: string;
  slug: string;
  title: string;
  domain: string;
  topicFamily: string;
  status: MapVisibility;
  summary: string;
  promptSummary: string;
  intro: string;
  seoTitle: string;
  seoDescription: string;
  renderingHints: unknown;
  visualSeries: unknown;
  revision: number;
  isPublic?: boolean;
  createdByNeonUserId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  publishedAt: Date | string | null;
};

function buildStoredMapDocument(row: MapRow): MapDocument {
  return {
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    intro: row.intro,
    domain: row.domain,
    topicFamily: row.topicFamily,
    dimensions: [],
    cells: [],
    featuredExamples: [],
    notableGaps: [],
    impossibleCombos: [],
    constraints: [],
    renderingHints: (row.renderingHints as MapDocument["renderingHints"]) ?? { accent: "", gradient: [] },
    visualSeries: row.visualSeries as MapDocument["visualSeries"],
    seo: {
      title: row.seoTitle,
      description: row.seoDescription,
    },
  };
}

async function hydrateMapDocument(db: DbLike, row: MapRow): Promise<MapDocument> {
  const axisRows = await db
    .select()
    .from(mapAxesTable)
    .where(eq(mapAxesTable.mapId, row.id))
    .orderBy(asc(mapAxesTable.position));
  if (!axisRows.length) {
    return buildStoredMapDocument(row);
  }

  const axisIds = axisRows.map((axis: any) => axis.id);
  const valueRows = axisIds.length
    ? await db
        .select()
        .from(mapAxisValuesTable)
        .where(inArray(mapAxisValuesTable.axisId, axisIds))
        .orderBy(asc(mapAxisValuesTable.position))
    : [];
  const valuesByAxisId = new Map<string, typeof valueRows>();
  for (const value of valueRows) {
    const list = valuesByAxisId.get(value.axisId) ?? [];
    list.push(value);
    valuesByAxisId.set(value.axisId, list);
  }

  const cellRows = await db
    .select()
    .from(mapCellsTable)
    .where(eq(mapCellsTable.mapId, row.id))
    .orderBy(asc(mapCellsTable.sortOrder));
  const cellIds = cellRows.map((cell: any) => cell.id);
  const coordinateRows = cellIds.length
    ? await db
        .select()
        .from(mapCellCoordinatesTable)
        .where(inArray(mapCellCoordinatesTable.cellId, cellIds))
    : [];
  const badgeRows = cellIds.length
    ? await db
        .select()
        .from(mapCellBadgesTable)
        .where(inArray(mapCellBadgesTable.cellId, cellIds))
        .orderBy(asc(mapCellBadgesTable.sortOrder))
    : [];
  const exampleRows = await db
    .select()
    .from(mapExamplesTable)
    .where(eq(mapExamplesTable.mapId, row.id))
    .orderBy(asc(mapExamplesTable.sortOrder));
  const exampleIds = exampleRows.map((example: any) => example.id);
  const referenceImageRows = exampleIds.length
    ? await db
        .select()
        .from(mapExampleReferenceImagesTable)
        .where(inArray(mapExampleReferenceImagesTable.exampleId, exampleIds))
        .orderBy(asc(mapExampleReferenceImagesTable.sortOrder))
    : [];
  const featuredRows = await db
    .select()
    .from(mapFeaturedExamplesTable)
    .where(eq(mapFeaturedExamplesTable.mapId, row.id))
    .orderBy(asc(mapFeaturedExamplesTable.sortOrder));
  const constraintRows = await db
    .select()
    .from(mapConstraintsTable)
    .where(eq(mapConstraintsTable.mapId, row.id))
    .orderBy(asc(mapConstraintsTable.sortOrder));
  const calloutRows = await db
    .select()
    .from(mapCalloutsTable)
    .where(eq(mapCalloutsTable.mapId, row.id))
    .orderBy(asc(mapCalloutsTable.sortOrder));

  const assetIds = cellRows
    .map((cell: any) => cell.visualizationAssetId)
    .filter((value: any): value is string => typeof value === "string" && value.length > 0);
  const assetRows = assetIds.length
    ? await db.select().from(mediaAssetsTable).where(inArray(mediaAssetsTable.id, assetIds))
    : [];
  const assetById = new Map<string, any>(assetRows.map((asset: any) => [asset.id, asset]));

  const axisById = new Map<string, any>(axisRows.map((axis: any) => [axis.id, axis]));
  const axisValueById = new Map<string, any>(valueRows.map((value: any) => [value.id, value]));
  const badgesByCellId = new Map<string, string[]>();
  for (const badge of badgeRows) {
    const list = badgesByCellId.get(badge.cellId) ?? [];
    list.push(badge.label);
    badgesByCellId.set(badge.cellId, list);
  }

  const referenceImagesByExampleId = new Map<string, NonNullable<MapExample["referenceImages"]>>();
  for (const image of referenceImageRows) {
    const list = referenceImagesByExampleId.get(image.exampleId) ?? [];
    list.push({
      link: image.link,
      thumbnail: image.thumbnail ?? undefined,
      title: image.title ?? undefined,
      source: image.source ?? undefined,
    });
    referenceImagesByExampleId.set(image.exampleId, list);
  }

  const examplesByCellId = new Map<string, MapExample[]>();
  const exampleById = new Map<string, MapExample>();
  for (const example of exampleRows) {
    const hydrated: MapExample = {
      name: example.name,
      description: example.description,
      coordinates: example.coordinatesSnapshot as Record<string, string>,
      status: example.status,
      brand: example.brand ?? undefined,
      year: example.year ?? undefined,
      evidenceNote: example.evidenceNote ?? undefined,
      confidence: fromBasisPoints(example.confidence),
      referenceImages: referenceImagesByExampleId.get(example.id),
    };
    exampleById.set(example.id, hydrated);
    if (example.cellId) {
      const list = examplesByCellId.get(example.cellId) ?? [];
      list.push(hydrated);
      examplesByCellId.set(example.cellId, list);
    }
  }

  const coordinatesByCellId = new Map<string, Record<string, string>>();
  for (const coordinate of coordinateRows) {
    const axis = axisById.get(coordinate.axisId);
    const axisValue = axisValueById.get(coordinate.axisValueId);
    if (!axis || !axisValue) continue;
    const record = coordinatesByCellId.get(coordinate.cellId) ?? {};
    record[axis.axisKey] = axisValue.label;
    coordinatesByCellId.set(coordinate.cellId, record);
  }

  const cells = cellRows.map((cell: any) => {
    const asset = cell.visualizationAssetId ? assetById.get(cell.visualizationAssetId) : null;
    return {
      id: cell.cellKey,
      coordinates: coordinatesByCellId.get(cell.id) ?? {},
      label: cell.label,
      status: cell.status,
      explanation: cell.explanation,
      confidence: fromBasisPoints(cell.confidence) ?? 0,
      badges: badgesByCellId.get(cell.id) ?? [],
      examples: examplesByCellId.get(cell.id) ?? [],
      visualization: asset
        ? {
            imageUrl: asset.publicUrl,
            caption: cell.visualizationCaption ?? undefined,
            imageModel: cell.visualizationImageModel ?? undefined,
            prompt: cell.visualizationPrompt ?? undefined,
            byteHash: cell.visualizationByteHash ?? undefined,
          }
        : undefined,
    };
  });

  return {
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    intro: row.intro,
    domain: row.domain,
    topicFamily: row.topicFamily,
    dimensions: axisRows.map((axis: any) => ({
      key: axis.axisKey,
      label: axis.label,
      description: axis.description,
      values: (valuesByAxisId.get(axis.id) ?? []).map((value: any) => value.label),
    })),
    cells,
    featuredExamples: featuredRows
      .map((featured: any) => exampleById.get(featured.exampleId))
      .filter((example: MapExample | undefined): example is MapExample => Boolean(example)),
    notableGaps: calloutRows
      .filter((callout: any) => callout.kind === "notable_gap")
      .map((callout: any) => ({
        label: callout.label,
        explanation: callout.explanation,
        coordinates: callout.coordinatesSnapshot as Record<string, string>,
      })),
    impossibleCombos: calloutRows
      .filter((callout: any) => callout.kind === "impossible_combo")
      .map((callout: any) => ({
        label: callout.label,
        explanation: callout.explanation,
        coordinates: callout.coordinatesSnapshot as Record<string, string>,
      })),
    constraints: constraintRows.map((constraint: any) => ({
      label: constraint.label,
      kind: constraint.kind,
      explanation: constraint.explanation,
    })),
    renderingHints: (row.renderingHints as MapDocument["renderingHints"]) ?? { accent: "", gradient: [] },
    visualSeries: row.visualSeries as MapDocument["visualSeries"],
    seo: {
      title: row.seoTitle,
      description: row.seoDescription,
    },
  };
}

async function hydrateSavedMap(
  db: DbLike,
  row: MapRow,
  creatorName: string | null = null,
): Promise<SavedMap> {
  const document = await hydrateMapDocument(db, row);
  return serializeSavedMap({
    id: row.id,
    slug: row.slug,
    title: row.title,
    domain: row.domain,
    topicFamily: row.topicFamily,
    status: row.status,
    publishedAt: row.publishedAt ? coerceIsoString(row.publishedAt) : null,
    createdAt: coerceIsoString(row.createdAt),
    updatedAt: coerceIsoString(row.updatedAt),
    summary: row.summary,
    promptSummary: row.promptSummary,
    document,
    revision: row.revision ?? 0,
    isPublic: row.isPublic ?? false,
    createdByNeonUserId: row.createdByNeonUserId ?? null,
    createdByDisplayName: creatorName,
  });
}

/**
 * Resolve a set of Neon Auth user ids → "best display string" (name, falling
 * back to local-part of email). Looks up `neon_auth.user` once per call —
 * callers should batch ids before invoking this. Failures (table missing in
 * tests, transient connection error) are swallowed and return an empty map so
 * map listings keep working without creator labels.
 */
async function resolveCreatorNames(
  db: DbLike,
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)),
  );
  const result = new Map<string, string>();
  if (!unique.length) return result;
  try {
    const rows = (await db.execute(
      sql`SELECT id::text AS id, name, email FROM neon_auth."user" WHERE id::text IN ${sql.raw(
        `(${unique.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`,
      )}`,
    )) as unknown as Array<{ id: string; name: string | null; email: string | null }>;
    for (const row of rows) {
      const display =
        (row.name && row.name.trim()) ||
        (row.email && row.email.split("@")[0]?.trim()) ||
        null;
      if (display) result.set(row.id, display);
    }
  } catch (error) {
    logReadFallback("resolveCreatorNames", error);
  }
  return result;
}

async function hydrateSpotlightRows(
  db: DbLike,
  rows: any[],
  requesterId?: string,
) {
  const assetIds = rows
    .map((row) => row.imageAssetId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const assets = assetIds.length
    ? await db.select().from(mediaAssetsTable).where(inArray(mediaAssetsTable.id, assetIds))
    : [];
  const assetById = new Map<string, any>(assets.map((asset: any) => [asset.id, asset]));

  let votes: LeaderboardVote[] = [];
  if (requesterId && rows.length) {
    votes = ((await db
      .select()
      .from(spotlightVotesTable)
      .where(
        and(
          eq(spotlightVotesTable.requesterId, requesterId),
          inArray(
            spotlightVotesTable.spotlightId,
            rows.map((row: any) => row.id),
          ),
        ),
      )) as any[]).map(toLeaderboardVote);
  }

  const items = rows.map((row) =>
    serializeLeaderboardEntry({
      id: row.id,
      slug: row.slug,
      mapId: row.mapId,
      mapSlug: row.mapSlugSnapshot,
      mapTitle: row.mapTitleSnapshot,
      topicFamily: row.topicFamilySnapshot,
      cellId: row.cellId,
      cellLabel: row.cellLabelSnapshot,
      coordinatesSnapshot: row.coordinatesSnapshot as Record<string, string>,
      imageUrl: row.imageAssetId ? (assetById.get(row.imageAssetId)?.publicUrl ?? "") : "",
      storyTitle: row.storyTitle,
      storySummary: row.storySummary,
      publishedAt: coerceIsoString(row.publishedAt),
      createdAt: coerceIsoString(row.createdAt),
      score: row.score,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
    }),
  );

  return attachViewerVote(items, votes, requesterId);
}

export async function listLeaderboardTopicFamilies(): Promise<string[]> {
  try {
    const db = getDb();
    const rows = await db.select({ topicFamily: spotlightsTable.topicFamilySnapshot }).from(spotlightsTable);
    return [...new Set(rows.map((row) => row.topicFamily).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    logReadFallback("listLeaderboardTopicFamilies", error);
    return [];
  }
}

export async function listLeaderboardEntries({
  topicFamily,
  sort = "top",
  page = 1,
  pageSize = 12,
  requesterId,
  ownerId,
}: {
  topicFamily?: string;
  sort?: LeaderboardSort;
  page?: number;
  pageSize?: number;
  requesterId?: string;
  /**
   * When set, restrict to entries whose source map was created by this
   * Neon Auth user id. Used by the "mine" scope toggle on /leaderboard.
   * The `spotlights` table has no owner column today; we join through
   * `maps.created_by_neon_user_id` instead, so no migration is required.
   */
  ownerId?: string;
}) {
  try {
    const db = getDb();
    const filters = [
      topicFamily && topicFamily !== "All"
        ? eq(spotlightsTable.topicFamilySnapshot, topicFamily)
        : undefined,
      ownerId
        ? inArray(
            spotlightsTable.mapId,
            db
              .select({ id: mapsTable.id })
              .from(mapsTable)
              .where(eq(mapsTable.createdByNeonUserId, ownerId)),
          )
        : undefined,
    ].filter(Boolean);
    const whereClause = filters.length ? and(...filters as any) : undefined;
    const rows = await db
      .select()
      .from(spotlightsTable)
      .where(whereClause)
      .orderBy(
        sort === "top" ? desc(spotlightsTable.score) : desc(spotlightsTable.publishedAt),
        desc(spotlightsTable.publishedAt),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(spotlightsTable)
      .where(whereClause);

    return {
      items: await hydrateSpotlightRows(db, rows, requesterId),
      total: Number(count),
    };
  } catch (error) {
    logReadFallback("listLeaderboardEntries", error);
    return {
      items: [],
      total: 0,
    };
  }
}

export async function getLeaderboardEntryBySlug(slug: string, requesterId?: string) {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(spotlightsTable)
      .where(eq(spotlightsTable.slug, slug))
      .limit(1);
    if (!rows.length) return null;
    return (await hydrateSpotlightRows(db, rows, requesterId))[0] ?? null;
  } catch (error) {
    logReadFallback("getLeaderboardEntryBySlug", error);
    return null;
  }
}

async function getMapAndCellForSpotlight(db: DbLike, mapSlug: string, cellKey: string) {
  const maps = await db.select().from(mapsTable).where(eq(mapsTable.slug, mapSlug)).limit(1);
  const map = maps[0] as MapRow | undefined;
  if (!map) return { map: null, cell: null, assetUrl: null, coordinates: null as Record<string, string> | null };

  const cells = await db
    .select()
    .from(mapCellsTable)
    .where(and(eq(mapCellsTable.mapId, map.id), eq(mapCellsTable.cellKey, cellKey)))
    .limit(1);
  const cell = cells[0];
  if (!cell) return { map, cell: null, assetUrl: null, coordinates: null };

  const asset =
    cell.visualizationAssetId
      ? (
          await db
            .select()
            .from(mediaAssetsTable)
            .where(eq(mediaAssetsTable.id, cell.visualizationAssetId))
            .limit(1)
        )[0]
      : null;

  const coordinateRows = await db
    .select()
    .from(mapCellCoordinatesTable)
    .where(eq(mapCellCoordinatesTable.cellId, cell.id));
  const axisRows = await db
    .select()
    .from(mapAxesTable)
    .where(eq(mapAxesTable.mapId, map.id));
  const axisValueRows = axisRows.length
    ? await db
        .select()
        .from(mapAxisValuesTable)
        .where(inArray(mapAxisValuesTable.axisId, axisRows.map((axis: any) => axis.id)))
    : [];
  const axisById = new Map<string, any>(axisRows.map((axis: any) => [axis.id, axis]));
  const axisValueById = new Map<string, any>(axisValueRows.map((value: any) => [value.id, value]));
  const coordinates: Record<string, string> = {};
  for (const coordinate of coordinateRows) {
    const axis = axisById.get(coordinate.axisId);
    const value = axisValueById.get(coordinate.axisValueId);
    if (axis && value) {
      coordinates[axis.axisKey] = value.label;
    }
  }

  return {
    map,
    cell,
    assetUrl: asset?.publicUrl ?? null,
    coordinates,
  };
}

export async function publishGapSpotlight({
  mapSlug,
  cellId,
  storyTitle,
  storySummary,
  makePublic,
  publishedByNeonUserId,
}: {
  mapSlug: string;
  cellId: string;
  storyTitle: string;
  storySummary: string;
  /**
   * If true, also flips the source map to `is_public = true` as part of
   * publishing. Without this, viewers reaching the spotlight's "View source
   * map" link from a private map will hit a 404.
   */
  makePublic?: boolean;
  publishedByNeonUserId?: string | null;
}) {
  const db = getDb();
  const { map, cell, assetUrl, coordinates } = await getMapAndCellForSpotlight(db, mapSlug, cellId);
  if (!map) {
    throw new Error("Map not found.");
  }
  if (!cell || !["gap", "tension", "impossible"].includes(cell.status)) {
    throw new Error("Only visualized cells can be published to the leaderboard.");
  }
  if (!cell.visualizationAssetId || !assetUrl) {
    throw new Error("Generate an image for this cell before publishing it to the leaderboard.");
  }

  if (makePublic && !map.isPublic) {
    await db
      .update(mapsTable)
      .set({
        isPublic: true,
        updatedAt: new Date(),
        updatedByNeonUserId: publishedByNeonUserId ?? null,
      })
      .where(eq(mapsTable.id, map.id));
  }

  const now = isoNow();
  const slug = buildLeaderboardSlug(map.slug, cell.cellKey);
  const existingRows = await db
    .select()
    .from(spotlightsTable)
    .where(and(eq(spotlightsTable.mapId, map.id), eq(spotlightsTable.cellId, cell.id)))
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    await db
      .update(spotlightsTable)
      .set({
        mapSlugSnapshot: map.slug,
        mapTitleSnapshot: map.title,
        topicFamilySnapshot: map.topicFamily,
        cellLabelSnapshot: cell.label,
        coordinatesSnapshot: coordinates ?? {},
        imageAssetId: cell.visualizationAssetId,
        storyTitle,
        storySummary,
        publishedAt: new Date(now),
      })
      .where(eq(spotlightsTable.id, existing.id));
  } else {
    await db.insert(spotlightsTable).values({
      id: `spotlight_${crypto.randomUUID()}`,
      slug,
      mapId: map.id,
      cellId: cell.id,
      mapSlugSnapshot: map.slug,
      mapTitleSnapshot: map.title,
      topicFamilySnapshot: map.topicFamily,
      cellLabelSnapshot: cell.label,
      coordinatesSnapshot: coordinates ?? {},
      imageAssetId: cell.visualizationAssetId,
      storyTitle,
      storySummary,
      score: 0,
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date(now),
      publishedAt: new Date(now),
    });
  }

  return (await getLeaderboardEntryBySlug(existing?.slug ?? slug))!;
}

export async function castLeaderboardVote({
  slug,
  requesterId,
  direction,
}: {
  slug: string;
  requesterId: string;
  direction: LeaderboardVoteDirection | null;
}) {
  const db = getDb();
  const rows = await db
    .select()
    .from(spotlightsTable)
    .where(eq(spotlightsTable.slug, slug))
    .limit(1);
  if (!rows.length) return null;
  const spotlight = rows[0]!;

  const updatedEntry = await db.transaction(async (tx) => {
    const existingRows = (await tx
      .select({ direction: spotlightVotesTable.direction })
      .from(spotlightVotesTable)
      .where(
        and(
          eq(spotlightVotesTable.spotlightId, spotlight.id),
          eq(spotlightVotesTable.requesterId, requesterId),
        ),
      )
      .limit(1)) as Array<{ direction: LeaderboardVoteDirection }>;
    const previousDirection = existingRows[0]?.direction ?? null;

    if (direction === null) {
      if (previousDirection !== null) {
        await tx
          .delete(spotlightVotesTable)
          .where(
            and(
              eq(spotlightVotesTable.spotlightId, spotlight.id),
              eq(spotlightVotesTable.requesterId, requesterId),
            ),
          );
      }
    } else if (previousDirection !== null) {
      if (previousDirection !== direction) {
        await tx
          .update(spotlightVotesTable)
          .set({
            direction,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(spotlightVotesTable.spotlightId, spotlight.id),
              eq(spotlightVotesTable.requesterId, requesterId),
            ),
          );
      }
    } else {
      await tx.insert(spotlightVotesTable).values({
        spotlightId: spotlight.id,
        requesterId,
        direction,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const upvoteDelta =
      (direction === "up" ? 1 : 0) - (previousDirection === "up" ? 1 : 0);
    const downvoteDelta =
      (direction === "down" ? 1 : 0) - (previousDirection === "down" ? 1 : 0);
    const scoreDelta = upvoteDelta - downvoteDelta;

    if (upvoteDelta === 0 && downvoteDelta === 0) {
      return {
        score: spotlight.score,
        upvotes: spotlight.upvotes,
        downvotes: spotlight.downvotes,
      };
    }

    const [updated] = (await tx
      .update(spotlightsTable)
      .set({
        upvotes: sql`${spotlightsTable.upvotes} + ${upvoteDelta}`,
        downvotes: sql`${spotlightsTable.downvotes} + ${downvoteDelta}`,
        score: sql`${spotlightsTable.score} + ${scoreDelta}`,
      })
      .where(eq(spotlightsTable.id, spotlight.id))
      .returning({
        score: spotlightsTable.score,
        upvotes: spotlightsTable.upvotes,
        downvotes: spotlightsTable.downvotes,
      })) as Array<{ score: number; upvotes: number; downvotes: number }>;

    return updated;
  });

  const detail = await getLeaderboardEntryBySlug(slug, requesterId);
  return detail
    ? {
        ...detail,
        score: updatedEntry.score,
        upvotes: updatedEntry.upvotes,
        downvotes: updatedEntry.downvotes,
      }
    : null;
}

export type MapListingVisibility = MapVisibility | "live" | "library";

export async function listMaps({
  topicFamily,
  status = "published",
  page = 1,
  pageSize = 9,
  ownerId,
  publicOnly = false,
  includePublic = false,
  query,
  visibility,
  sort = "recent",
}: {
  topicFamily?: string;
  status?: MapListingVisibility | "all";
  page?: number;
  pageSize?: number;
  /** Restrict to maps owned by this Neon Auth user id. */
  ownerId?: string;
  /** Restrict to maps with `is_public = true` (gallery / signed-out browse). */
  publicOnly?: boolean;
  /**
   * When combined with `ownerId`, also include maps that are `is_public = true`
   * regardless of owner. Lets the signed-in sidebar surface the public catalog
   * alongside the viewer's own (possibly private) library, so seed maps with
   * `created_by_neon_user_id = null` aren't invisible after sign-in.
   */
  includePublic?: boolean;
  /** Case-insensitive admin/library search across common identifying fields. */
  query?: string;
  /** Restrict by public/private map visibility. */
  visibility?: "public" | "private";
  /**
   * Ordering. `recent` (default) sorts by publishedAt desc. `top` floats
   * maps that have appeared on the leaderboard to the front, ordered by
   * the sum of their entries' scores. The result still falls back to
   * publishedAt desc as a tie-breaker.
   */
  sort?: "recent" | "top";
}) {
  try {
    const db = getDb();
    const statusFilter =
      status === "all"
        ? undefined
        : status === "live"
        ? ne(mapsTable.status, "failed")
        : status === "library"
          ? inArray(mapsTable.status, ["published", "generating", "failed"])
          : eq(mapsTable.status, status);

    const conditions = statusFilter ? [statusFilter] : [];
    if (topicFamily && topicFamily !== "All") {
      conditions.push(eq(mapsTable.topicFamily, topicFamily));
    }
    if (ownerId && includePublic) {
      conditions.push(
        or(eq(mapsTable.createdByNeonUserId, ownerId), eq(mapsTable.isPublic, true))!,
      );
    } else if (ownerId) {
      conditions.push(eq(mapsTable.createdByNeonUserId, ownerId));
    } else if (includePublic) {
      conditions.push(eq(mapsTable.isPublic, true));
    }
    if (publicOnly) {
      conditions.push(eq(mapsTable.isPublic, true));
    }
    if (visibility === "public") {
      conditions.push(eq(mapsTable.isPublic, true));
    } else if (visibility === "private") {
      conditions.push(eq(mapsTable.isPublic, false));
    }
    const search = query?.trim();
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(mapsTable.title, pattern),
          ilike(mapsTable.topicFamily, pattern),
          ilike(mapsTable.domain, pattern),
          ilike(mapsTable.slug, pattern),
          ilike(mapsTable.createdByNeonUserId, pattern),
        )!,
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    // `top` ordering: float maps that have leaderboard entries to the top,
    // ranked by the summed score of those entries (publishedAt breaks ties).
    // Implemented with a correlated subquery so we don't need a schema
    // migration.
    const topScoreExpr = sql<number>`COALESCE((
      SELECT SUM(${spotlightsTable.score})
      FROM ${spotlightsTable}
      WHERE ${spotlightsTable.mapId} = ${mapsTable.id}
    ), 0)`;
    const orderBy =
      sort === "top"
        ? [desc(topScoreExpr), desc(mapsTable.publishedAt)]
        : [desc(mapsTable.publishedAt)];

    const rows = await db
      .select()
      .from(mapsTable)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mapsTable)
      .where(whereClause);

    const creatorNames = await resolveCreatorNames(
      db,
      rows.map((row: any) => row.createdByNeonUserId),
    );

    const items: SavedMap[] = [];
    for (const row of rows) {
      try {
        const typedRow = row as unknown as MapRow;
        const creator = typedRow.createdByNeonUserId
          ? creatorNames.get(typedRow.createdByNeonUserId) ?? null
          : null;
        items.push(await hydrateSavedMap(db, typedRow, creator));
      } catch (err) {
        console.error("[listMaps] skipping unreadable map row:", (row as { slug?: string })?.slug, err);
      }
    }

    return {
      items,
      total: Number(count),
    };
  } catch (error) {
    logReadFallback("listMaps", error);
    return {
      items: [],
      total: 0,
    };
  }
}

export async function getMapBySlug(slug: string) {
  try {
    const db = getDb();
    const rows = await db.select().from(mapsTable).where(eq(mapsTable.slug, slug)).limit(1);
    if (!rows.length) return null;
    const row = rows[0] as unknown as MapRow;
    const creatorNames = await resolveCreatorNames(db, [row.createdByNeonUserId]);
    const creator = row.createdByNeonUserId
      ? creatorNames.get(row.createdByNeonUserId) ?? null
      : null;
    return hydrateSavedMap(db, row, creator);
  } catch (error) {
    logReadFallback("getMapBySlug", error);
    return null;
  }
}

export async function deleteMapBySlug(slug: string) {
  const db = getDb();
  const existingMap = await getMapBySlug(slug);
  if (!existingMap) return null;

  // Collect media_assets that this map's cells/spotlights are the only owners
  // of. We do this BEFORE the cascade delete (the FK on
  // map_cells.visualization_asset_id is `set null` only on asset delete; on
  // map delete the cell row vanishes and the asset row is left orphaned).
  const ownedAssetRows: Array<{ id: string; provider: string; storageKey: string | null; publicUrl: string }> =
    await db
      .select({
        id: mediaAssetsTable.id,
        provider: mediaAssetsTable.provider,
        storageKey: mediaAssetsTable.storageKey,
        publicUrl: mediaAssetsTable.publicUrl,
      })
      .from(mediaAssetsTable)
      .where(
        and(
          isNotNull(mediaAssetsTable.id),
          or(
            inArray(
              mediaAssetsTable.id,
              db
                .select({ id: mapCellsTable.visualizationAssetId })
                .from(mapCellsTable)
                .where(and(eq(mapCellsTable.mapId, existingMap.id), isNotNull(mapCellsTable.visualizationAssetId))),
            ),
            inArray(
              mediaAssetsTable.id,
              db
                .select({ id: spotlightsTable.imageAssetId })
                .from(spotlightsTable)
                .where(and(eq(spotlightsTable.mapId, existingMap.id), isNotNull(spotlightsTable.imageAssetId))),
            ),
          )!,
        ),
      );

  await db.delete(mapsTable).where(eq(mapsTable.slug, slug));

  if (ownedAssetRows.length) {
    const assetIds = ownedAssetRows.map((row) => row.id);
    await db.delete(mediaAssetsTable).where(inArray(mediaAssetsTable.id, assetIds));

    const blobUrls = ownedAssetRows
      .filter((row) => row.provider === "vercel_blob")
      .map((row) => row.publicUrl)
      .filter((url): url is string => typeof url === "string" && url.length > 0);
    if (blobUrls.length) {
      try {
        await deleteBlob(blobUrls);
      } catch (error) {
        console.error(`[deleteMapBySlug] blob cleanup failed for ${slug}:`, error);
      }
    }
  }

  notifyList(existingMap.createdByNeonUserId ?? null, {
    kind: "map_deleted",
    slug,
    ownerId: existingMap.createdByNeonUserId ?? null,
  });

  return existingMap;
}

export async function saveMap({
  brief,
  normalizedBrief,
  document,
  status,
  metrics,
  ownerId,
  isPublic = false,
}: {
  brief: MapBrief;
  normalizedBrief: NormalizedMapBrief;
  document: MapDocument;
  status: MapVisibility;
  metrics?: GenerationMetrics | null;
  ownerId?: string | null;
  isPublic?: boolean;
}) {
  const id = `map_${crypto.randomUUID()}`;
  const slug = slugify(document.slug || document.title);
  const saved: SavedMap = {
    id,
    slug,
    title: document.title,
    domain: document.domain,
    topicFamily: document.topicFamily,
    status,
    publishedAt: status === "published" ? isoNow() : null,
    createdAt: isoNow(),
    updatedAt: isoNow(),
    summary: document.summary,
    promptSummary: brief.extraContext || brief.combines,
    document: {
      ...document,
      slug,
    },
    isPublic,
    createdByNeonUserId: ownerId ?? null,
  };

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(mapsTable).values({
      id,
      slug,
      title: saved.title,
      domain: saved.domain,
      topicFamily: saved.topicFamily,
      status,
      summary: saved.summary,
      promptSummary: saved.promptSummary,
      intro: saved.document.intro,
      seoTitle: saved.document.seo.title,
      seoDescription: saved.document.seo.description,
      renderingHints: saved.document.renderingHints,
      visualSeries: saved.document.visualSeries ?? null,
      isPublic,
      createdByNeonUserId: ownerId ?? null,
      updatedByNeonUserId: ownerId ?? null,
      publishedAt: status === "published" ? new Date(saved.publishedAt ?? isoNow()) : null,
    });
    await syncMapRelations(tx as DbLike, id, saved.document);
  });

  await logGenerationRun({
    id: `run_${crypto.randomUUID()}`,
    mapId: id,
    status: "success",
    model: appConfig.openRouter.model,
    fallbackModel: appConfig.openRouter.fallbackModel,
    normalizedBrief,
    inputBrief: brief,
    metrics: metrics ?? null,
    createdAt: isoNow(),
  });

  notifyMap({ kind: "status_change", slug, status, revision: 0 });
  notifyList(ownerId ?? null, {
    kind: "map_status",
    slug,
    status,
    updatedAt: saved.updatedAt,
    ownerId: ownerId ?? null,
    isPublic,
  });

  return serializeSavedMap(saved);
}

export async function patchMapCellVisualization(
  slug: string,
  cellId: string,
  visualization: {
    imageUrl: string;
    caption?: string;
    updatedAt: string;
    imageModel?: string;
    prompt?: string;
    byteHash?: string;
    provider?: "public_path" | "external_url" | "vercel_blob";
    storageKey?: string;
    mimeType?: string;
    byteSize?: number;
  },
): Promise<boolean> {
  const db = getDb();
  const mapRows = await db
    .select({
      id: mapsTable.id,
      status: mapsTable.status,
      isPublic: mapsTable.isPublic,
      createdByNeonUserId: mapsTable.createdByNeonUserId,
    })
    .from(mapsTable)
    .where(eq(mapsTable.slug, slug))
    .limit(1);
  const mapRow = mapRows[0];
  if (!mapRow) {
    return false;
  }

  const resolvedAsset = await resolveVisualizationMediaAssetInput(slug, cellId, {
    publicUrl: visualization.imageUrl,
    provider: visualization.provider,
    storageKey: visualization.storageKey,
    mimeType: visualization.mimeType,
    byteSize: visualization.byteSize,
    altText: visualization.caption ?? cellId,
    byteHash: visualization.byteHash,
  });
  const assetId = await ensureMediaAsset(db, resolvedAsset);

  const cellRows = await db
    .select()
    .from(mapCellsTable)
    .where(and(eq(mapCellsTable.mapId, mapRow.id), eq(mapCellsTable.cellKey, cellId)))
    .limit(1);
  const targetCell = cellRows[0];
  if (!targetCell) {
    return false;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(mapCellsTable)
      .set({
        visualizationAssetId: assetId,
        visualizationCaption: visualization.caption ?? null,
        visualizationImageModel: visualization.imageModel ?? null,
        visualizationPrompt: visualization.prompt ?? null,
        visualizationByteHash: resolvedAsset.byteHash ?? visualization.byteHash ?? null,
      })
      .where(eq(mapCellsTable.id, targetCell.id));
    await tx
      .update(mapsTable)
      .set({
        revision: sql`${mapsTable.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(mapsTable.slug, slug));
  });

  const updatedRows = await db
    .select({ revision: mapsTable.revision, updatedAt: mapsTable.updatedAt })
    .from(mapsTable)
    .where(eq(mapsTable.slug, slug))
    .limit(1);
  const revision = updatedRows[0]?.revision ?? 0;
  const updatedAt = updatedRows[0]?.updatedAt ?? new Date();

  notifyMap({
    kind: "cell_visualization",
    slug,
    cellId,
    revision,
    visualization: {
      imageUrl: visualization.imageUrl,
      caption: visualization.caption,
      updatedAt: visualization.updatedAt,
      imageModel: visualization.imageModel,
      prompt: visualization.prompt,
      byteHash: resolvedAsset.byteHash ?? visualization.byteHash,
    },
  });
  notifyList(mapRow.createdByNeonUserId ?? null, {
    kind: "map_status",
    slug,
    status: mapRow.status as MapVisibility,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
    ownerId: mapRow.createdByNeonUserId ?? null,
    isPublic: Boolean(mapRow.isPublic),
  });
  return true;
}

function buildPlaceholderDocument(brief: MapBrief, slug: string): MapDocument {
  const topic = brief.topic.trim() || "Untitled map";
  return {
    title: topic,
    slug,
    summary: "",
    intro: "",
    domain: "",
    topicFamily: "",
    dimensions: [],
    cells: [],
    featuredExamples: [],
    notableGaps: [],
    impossibleCombos: [],
    constraints: [],
    renderingHints: { accent: "", gradient: [] },
    seo: { title: topic, description: "" },
  };
}

async function findUniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const fallback = base || "map";
  let candidate = fallback;
  let n = 1;
  while (true) {
    const existing = await db
      .select({ slug: mapsTable.slug })
      .from(mapsTable)
      .where(eq(mapsTable.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    n += 1;
    candidate = `${fallback}-${n}`.slice(0, 128);
    if (n > 999) {
      candidate = `${fallback}-${crypto.randomUUID().slice(0, 6)}`.slice(0, 128);
      return candidate;
    }
  }
}

export async function reserveMap({
  brief,
  ownerId,
}: {
  brief: MapBrief;
  ownerId?: string | null;
}): Promise<{
  id: string;
  slug: string;
}> {
  const id = `map_${crypto.randomUUID()}`;
  const baseSlug = slugify(brief.topic);
  const slug = await findUniqueSlug(baseSlug);
  const placeholder = buildPlaceholderDocument(brief, slug);
  const title = placeholder.title;

  const db = getDb();
  await db.insert(mapsTable).values({
    id,
    slug,
    title,
    domain: "",
    topicFamily: "",
    status: "generating",
    summary: "",
    promptSummary: brief.extraContext || brief.combines || "",
    intro: "",
    seoTitle: title,
    seoDescription: "",
    renderingHints: placeholder.renderingHints,
    visualSeries: null,
    revision: 0,
    isPublic: false,
    createdByNeonUserId: ownerId ?? null,
    updatedByNeonUserId: ownerId ?? null,
    publishedAt: null,
  });

  notifyList(ownerId ?? null, {
    kind: "map_status",
    slug,
    status: "generating",
    updatedAt: new Date().toISOString(),
    ownerId: ownerId ?? null,
    isPublic: false,
  });

  return { id, slug };
}

export async function applyMapPatch({
  mapId,
  mutate,
  status,
  publishedAtIso,
}: {
  mapId: string;
  mutate: (current: MapDocument) => MapDocument;
  status?: MapVisibility;
  publishedAtIso?: string | null;
}): Promise<{ revision: number } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mapsTable)
    .where(eq(mapsTable.id, mapId))
    .limit(1);
  if (!rows.length) return null;

  const row = rows[0] as unknown as MapRow;
  const current = await hydrateMapDocument(db, row);
  const next = mutate(current);

  await db.transaction(async (tx) => {
    const patch: Record<string, unknown> = {
      title: next.title,
      domain: next.domain,
      topicFamily: next.topicFamily,
      summary: next.summary,
      intro: next.intro,
      seoTitle: next.seo.title,
      seoDescription: next.seo.description,
      renderingHints: next.renderingHints,
      visualSeries: next.visualSeries ?? null,
      revision: sql`${mapsTable.revision} + 1`,
      updatedAt: new Date(),
    };
    if (status !== undefined) patch.status = status;
    if (publishedAtIso !== undefined) {
      patch.publishedAt = publishedAtIso === null ? null : new Date(publishedAtIso);
    }
    await tx.update(mapsTable).set(patch).where(eq(mapsTable.id, mapId));
    await syncMapRelations(tx as DbLike, mapId, next);
  });

  const updated = await db
    .select({
      slug: mapsTable.slug,
      revision: mapsTable.revision,
      status: mapsTable.status,
      isPublic: mapsTable.isPublic,
      createdByNeonUserId: mapsTable.createdByNeonUserId,
      updatedAt: mapsTable.updatedAt,
    })
    .from(mapsTable)
    .where(eq(mapsTable.id, mapId))
    .limit(1);
  const after = updated[0];
  const revision = after?.revision ?? (row.revision ?? 0) + 1;

  if (after?.slug) {
    if (status !== undefined) {
      notifyMap({
        kind: "status_change",
        slug: after.slug,
        status,
        revision,
      });
    } else {
      notifyMap({ kind: "snapshot_revision", slug: after.slug, revision });
    }
    const updatedAt = after.updatedAt;
    notifyList(after.createdByNeonUserId ?? null, {
      kind: "map_status",
      slug: after.slug,
      status: (status ?? after.status) as MapVisibility,
      updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt ?? new Date().toISOString()),
      ownerId: after.createdByNeonUserId ?? null,
      isPublic: Boolean(after.isPublic),
    });
  }

  return { revision };
}

export async function getMapRevisionState(slug: string): Promise<{
  id: string;
  revision: number;
  status: MapVisibility;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: mapsTable.id,
      revision: mapsTable.revision,
      status: mapsTable.status,
    })
    .from(mapsTable)
    .where(eq(mapsTable.slug, slug))
    .limit(1);
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    revision: rows[0].revision ?? 0,
    status: rows[0].status as MapVisibility,
  };
}

export async function setMapPublicState(
  slug: string,
  isPublic: boolean,
  updatedByNeonUserId?: string | null,
): Promise<{ slug: string; isPublic: boolean } | null> {
  const db = getDb();
  const existing = await db
    .select({
      id: mapsTable.id,
      status: mapsTable.status,
      createdByNeonUserId: mapsTable.createdByNeonUserId,
    })
    .from(mapsTable)
    .where(eq(mapsTable.slug, slug))
    .limit(1);
  if (!existing.length) return null;
  const updatedAt = new Date();
  await db
    .update(mapsTable)
    .set({
      isPublic,
      updatedAt,
      updatedByNeonUserId: updatedByNeonUserId ?? null,
    })
    .where(eq(mapsTable.id, existing[0].id));

  notifyList(existing[0].createdByNeonUserId ?? null, {
    kind: "map_status",
    slug,
    status: existing[0].status as MapVisibility,
    updatedAt: updatedAt.toISOString(),
    ownerId: existing[0].createdByNeonUserId ?? null,
    isPublic,
  });

  return { slug, isPublic };
}

export async function logGenerationRun(run: GenerationRun) {
  const db = getDb();
  await db.insert(mapGenerationRunsTable).values({
    id: run.id,
    mapId: run.mapId,
    status: run.status,
    model: run.model,
    fallbackModel: run.fallbackModel,
    normalizedBrief: run.normalizedBrief,
    inputBrief: run.inputBrief,
    error: run.error,
    metrics: run.metrics ?? null,
    createdAt: new Date(run.createdAt),
  });
}

export async function logCellVisualizationRun(run: CellVisualizationRun) {
  const db = getDb();
  // Resolve the map_cells row id from (mapId, cellKey) so we can store a FK.
  let resolvedCellId: string | null = null;
  if (run.mapId && run.cellKey) {
    try {
      const rows = await db
        .select({ id: mapCellsTable.id })
        .from(mapCellsTable)
        .where(and(eq(mapCellsTable.mapId, run.mapId), eq(mapCellsTable.cellKey, run.cellKey)))
        .limit(1);
      resolvedCellId = rows[0]?.id ?? null;
    } catch {
      // Best-effort; null is fine.
    }
  }
  await db.insert(cellVisualizationRunsTable).values({
    id: run.id,
    mapId: run.mapId ?? null,
    cellId: resolvedCellId,
    imageModel: run.imageModel,
    imageGenerationCalls: run.imageGenerationCalls,
    promptTokens: run.promptTokens ?? null,
    completionTokens: run.completionTokens ?? null,
    totalTokens: run.totalTokens ?? null,
    wallTimeMsTotal: run.wallTimeMsTotal ?? null,
    createdAt: new Date(run.createdAt),
  });
}

export async function getMapCostBreakdown(mapId: string): Promise<MapCostBreakdown | null> {
  const db = getDb();
  try {
    // Latest successful generation run
    const genRuns = await db
      .select()
      .from(mapGenerationRunsTable)
      .where(and(eq(mapGenerationRunsTable.mapId, mapId), eq(mapGenerationRunsTable.status, "success")))
      .orderBy(desc(mapGenerationRunsTable.createdAt))
      .limit(1);
    const genRun = genRuns[0] ?? null;

    const vizRuns = await db
      .select()
      .from(cellVisualizationRunsTable)
      .where(eq(cellVisualizationRunsTable.mapId, mapId));

    // --- Generation cost ---
    const generationLines: import("@/lib/pricing").CostLineItem[] = [];
    let generationUsd = 0;

    if (genRun?.metrics) {
      const metrics = genRun.metrics as import("@/lib/generation-metrics").GenerationMetrics;
      const llmCost = totalLlmCost(metrics.stages ?? []);
      if (llmCost > 0) {
        generationLines.push({ label: "LLM tokens", usd: llmCost, detail: formatUsd(llmCost) });
        generationUsd += llmCost;
      }
      // SerpApi calls from all stages
      const serpCalls = (metrics.stages ?? []).reduce(
        (n, s) => n + (s.externalCallCount ?? 0),
        0,
      );
      if (serpCalls > 0) {
        const serpCost = serpCalls * SERPAPI_COST_PER_CALL;
        generationLines.push({
          label: "SerpApi searches",
          usd: serpCost,
          detail: `${serpCalls} calls · ${formatUsd(serpCost)}`,
        });
        generationUsd += serpCost;
      }
    }

    // --- Visualization cost ---
    const visualizationLines: import("@/lib/pricing").CostLineItem[] = [];
    let visualizationUsd = 0;

    for (const vr of vizRuns) {
      const cost = cellVisualizationCost({
        imageModel: vr.imageModel,
        imageGenerationCalls: vr.imageGenerationCalls ?? 1,
        promptTokens: vr.promptTokens ?? undefined,
        completionTokens: vr.completionTokens ?? undefined,
      });
      if (cost > 0) {
        visualizationLines.push({
          label: vr.imageModel.split("/").pop() ?? vr.imageModel,
          usd: cost,
        });
        visualizationUsd += cost;
      }
    }

    return {
      generationUsd,
      generationLines,
      visualizationUsd,
      visualizationLines,
      totalUsd: generationUsd + visualizationUsd,
    };
  } catch (error) {
    console.error("[store:getMapCostBreakdown]", error);
    return null;
  }
}
