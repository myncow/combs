import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { materializeCellImageAsset } from "@/lib/cell-visualization-storage";
import { appConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import {
  examplePromptsTable,
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
  ExamplePrompt,
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
import { pickMapThumbnail, slugify } from "@/lib/utils";

type DbLike = any;

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

function recalculateEntryScore(
  entry: LeaderboardEntry,
  votes: LeaderboardVote[],
): LeaderboardEntry {
  let upvotes = 0;
  let downvotes = 0;
  for (const vote of votes) {
    if (vote.entryId !== entry.id) continue;
    if (vote.direction === "up") upvotes += 1;
    if (vote.direction === "down") downvotes += 1;
  }
  return {
    ...entry,
    upvotes,
    downvotes,
    score: upvotes - downvotes,
  };
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

async function clearMapRelations(db: DbLike, mapId: string) {
  const cellRows = await db
    .select({ id: mapCellsTable.id })
    .from(mapCellsTable)
    .where(eq(mapCellsTable.mapId, mapId));
  const cellIds = cellRows.map((row: any) => row.id);

  const exampleRows = await db
    .select({ id: mapExamplesTable.id })
    .from(mapExamplesTable)
    .where(eq(mapExamplesTable.mapId, mapId));
  const exampleIds = exampleRows.map((row: any) => row.id);

  if (cellIds.length) {
    await db.delete(mapCellBadgesTable).where(inArray(mapCellBadgesTable.cellId, cellIds));
    await db.delete(mapCellCoordinatesTable).where(inArray(mapCellCoordinatesTable.cellId, cellIds));
  }
  if (exampleIds.length) {
    await db
      .delete(mapExampleReferenceImagesTable)
      .where(inArray(mapExampleReferenceImagesTable.exampleId, exampleIds));
    await db.delete(mapFeaturedExamplesTable).where(inArray(mapFeaturedExamplesTable.exampleId, exampleIds));
  }

  await db.delete(mapExamplesTable).where(eq(mapExamplesTable.mapId, mapId));
  await db.delete(mapCalloutsTable).where(eq(mapCalloutsTable.mapId, mapId));
  await db.delete(mapConstraintsTable).where(eq(mapConstraintsTable.mapId, mapId));
  await db.delete(mapCellsTable).where(eq(mapCellsTable.mapId, mapId));

  const axisRows = await db
    .select({ id: mapAxesTable.id })
    .from(mapAxesTable)
    .where(eq(mapAxesTable.mapId, mapId));
  const axisIds = axisRows.map((row: any) => row.id);
  if (axisIds.length) {
    await db.delete(mapAxisValuesTable).where(inArray(mapAxisValuesTable.axisId, axisIds));
  }
  await db.delete(mapAxesTable).where(eq(mapAxesTable.mapId, mapId));
}

function findCellByCoordinates(document: MapDocument, coordinates: Record<string, string>) {
  return document.cells.find((cell) =>
    Object.entries(coordinates).every(([key, value]) => cell.coordinates[key] === value),
  );
}

async function syncMapRelations(db: DbLike, mapId: string, document: MapDocument) {
  await clearMapRelations(db, mapId);

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
    const cellId = `cell_${crypto.randomUUID()}`;
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

    await db.insert(mapCellsTable).values({
      id: cellId,
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
    });

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
    await db.insert(mapCalloutsTable).values({
      id: `callout_${crypto.randomUUID()}`,
      mapId,
      cellId: findCellByCoordinates(document, callout.coordinates)?.id
        ? cellIdByKey.get(findCellByCoordinates(document, callout.coordinates)!.id) ?? null
        : null,
      kind: "notable_gap",
      label: callout.label,
      explanation: callout.explanation,
      coordinatesSnapshot: callout.coordinates,
      sortOrder: calloutIndex,
    });
  }

  for (const [calloutIndex, callout] of document.impossibleCombos.entries()) {
    await db.insert(mapCalloutsTable).values({
      id: `callout_${crypto.randomUUID()}`,
      mapId,
      cellId: findCellByCoordinates(document, callout.coordinates)?.id
        ? cellIdByKey.get(findCellByCoordinates(document, callout.coordinates)!.id) ?? null
        : null,
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
    cellSchema: { primaryX: "", primaryY: "" },
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
    cellSchema: { primaryX: axisRows[0]?.axisKey ?? "", primaryY: axisRows[1]?.axisKey ?? "" },
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

async function hydrateSavedMap(db: DbLike, row: MapRow): Promise<SavedMap> {
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
    summary: row.summary,
    promptSummary: row.promptSummary,
    document,
    revision: row.revision ?? 0,
  });
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

export async function listExamplePrompts(): Promise<ExamplePrompt[]> {
  try {
    const db = getDb();
    const rows = await db.select().from(examplePromptsTable).orderBy(asc(examplePromptsTable.title));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      topicFamily: row.topicFamily,
      prompt: row.prompt,
      whyItWorks: row.whyItWorks,
    }));
  } catch (error) {
    logReadFallback("listExamplePrompts", error);
    return [];
  }
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
}: {
  topicFamily?: string;
  sort?: LeaderboardSort;
  page?: number;
  pageSize?: number;
  requesterId?: string;
}) {
  try {
    const db = getDb();
    const whereClause =
      topicFamily && topicFamily !== "All" ? eq(spotlightsTable.topicFamilySnapshot, topicFamily) : undefined;
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
}: {
  mapSlug: string;
  cellId: string;
  storyTitle: string;
  storySummary: string;
}) {
  const db = getDb();
  const { map, cell, assetUrl, coordinates } = await getMapAndCellForSpotlight(db, mapSlug, cellId);
  if (!map) {
    throw new Error("Map not found.");
  }
  if (!cell || !["gap", "tension", "impossible"].includes(cell.status)) {
    throw new Error("Only visualized frontier cells can be published.");
  }
  if (!cell.visualizationAssetId || !assetUrl) {
    throw new Error("Generate an image for this frontier cell before publishing it.");
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
    const existingVotes = ((await tx
      .select()
      .from(spotlightVotesTable)
      .where(
        and(
          eq(spotlightVotesTable.spotlightId, spotlight.id),
          eq(spotlightVotesTable.requesterId, requesterId),
        ),
      )
      .limit(1)) as any[]).map(toLeaderboardVote);

    if (direction === null) {
      await tx
        .delete(spotlightVotesTable)
        .where(
          and(
            eq(spotlightVotesTable.spotlightId, spotlight.id),
            eq(spotlightVotesTable.requesterId, requesterId),
          ),
        );
    } else if (existingVotes.length) {
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
    } else {
      await tx.insert(spotlightVotesTable).values({
        spotlightId: spotlight.id,
        requesterId,
        direction,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const votes = ((await tx
      .select()
      .from(spotlightVotesTable)
      .where(eq(spotlightVotesTable.spotlightId, spotlight.id))) as any[]).map(toLeaderboardVote);

    const nextEntry = recalculateEntryScore(
      {
        id: spotlight.id,
        slug: spotlight.slug,
        mapId: spotlight.mapId,
        mapSlug: spotlight.mapSlugSnapshot,
        mapTitle: spotlight.mapTitleSnapshot,
        topicFamily: spotlight.topicFamilySnapshot,
        cellId: spotlight.cellId,
        cellLabel: spotlight.cellLabelSnapshot,
        coordinatesSnapshot: spotlight.coordinatesSnapshot as Record<string, string>,
        imageUrl: "",
        storyTitle: spotlight.storyTitle,
        storySummary: spotlight.storySummary,
        publishedAt: coerceIsoString(spotlight.publishedAt),
        createdAt: coerceIsoString(spotlight.createdAt),
        score: spotlight.score,
        upvotes: spotlight.upvotes,
        downvotes: spotlight.downvotes,
      },
      votes,
    );

    await tx
      .update(spotlightsTable)
      .set({
        score: nextEntry.score,
        upvotes: nextEntry.upvotes,
        downvotes: nextEntry.downvotes,
      })
      .where(eq(spotlightsTable.id, spotlight.id));

    return nextEntry;
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
}: {
  topicFamily?: string;
  status?: MapListingVisibility;
  page?: number;
  pageSize?: number;
}) {
  try {
    const db = getDb();
    const statusFilter =
      status === "live"
        ? ne(mapsTable.status, "failed")
        : status === "library"
          ? inArray(mapsTable.status, ["published", "generating", "failed"])
          : eq(mapsTable.status, status);

    const conditions = [statusFilter];
    if (topicFamily && topicFamily !== "All") {
      conditions.push(eq(mapsTable.topicFamily, topicFamily));
    }

    const rows = await db
      .select()
      .from(mapsTable)
      .where(and(...conditions))
      .orderBy(desc(mapsTable.publishedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mapsTable)
      .where(and(...conditions));

    const items: SavedMap[] = [];
    for (const row of rows) {
      try {
        items.push(await hydrateSavedMap(db, row as unknown as MapRow));
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
    return hydrateSavedMap(db, rows[0] as unknown as MapRow);
  } catch (error) {
    logReadFallback("getMapBySlug", error);
    return null;
  }
}

export async function deleteMapBySlug(slug: string) {
  const db = getDb();
  const existingMap = await getMapBySlug(slug);
  if (!existingMap) return null;
  await db.delete(mapsTable).where(eq(mapsTable.slug, slug));
  return existingMap;
}

export async function saveMap({
  brief,
  normalizedBrief,
  document,
  status,
  metrics,
}: {
  brief: MapBrief;
  normalizedBrief: NormalizedMapBrief;
  document: MapDocument;
  status: MapVisibility;
  metrics?: GenerationMetrics | null;
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
    summary: document.summary,
    promptSummary: brief.extraContext || brief.combines,
    document: {
      ...document,
      slug,
    },
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
    .select({ id: mapsTable.id })
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
    cellSchema: { primaryX: "", primaryY: "" },
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

export async function reserveMap({ brief }: { brief: MapBrief }): Promise<{
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
    publishedAt: null,
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
    .select({ revision: mapsTable.revision })
    .from(mapsTable)
    .where(eq(mapsTable.id, mapId))
    .limit(1);
  return { revision: updated[0]?.revision ?? (row.revision ?? 0) + 1 };
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
