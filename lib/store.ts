import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { appConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import {
  examplePromptsTable,
  generationRunsTable,
  leaderboardEntriesTable,
  leaderboardVotesTable,
  mapsTable,
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
  MapVisibility,
  NormalizedMapBrief,
  SavedMap,
} from "@/lib/types";
import { pickMapThumbnail, slugify } from "@/lib/utils";

function isoNow() {
  return new Date().toISOString();
}

function coerceIsoString(value: unknown, fallback = isoNow()): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
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

export async function listExamplePrompts(): Promise<ExamplePrompt[]> {
  const db = getDb();
  const rows = await db.select().from(examplePromptsTable).orderBy(asc(examplePromptsTable.title));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    topicFamily: row.topicFamily,
    prompt: row.prompt,
    whyItWorks: row.whyItWorks,
  }));
}

export async function listLeaderboardTopicFamilies(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ topicFamily: leaderboardEntriesTable.topicFamily }).from(leaderboardEntriesTable);
  return [...new Set(rows.map((row) => row.topicFamily).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
  const db = getDb();
  const whereClause =
    topicFamily && topicFamily !== "All" ? eq(leaderboardEntriesTable.topicFamily, topicFamily) : undefined;
  const rows = await db
    .select()
    .from(leaderboardEntriesTable)
    .where(whereClause)
    .orderBy(
      sort === "top" ? desc(leaderboardEntriesTable.score) : desc(leaderboardEntriesTable.publishedAt),
      desc(leaderboardEntriesTable.publishedAt),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leaderboardEntriesTable)
    .where(whereClause);

  let votes: LeaderboardVote[] = [];
  if (requesterId && rows.length) {
    votes = (await db
      .select()
      .from(leaderboardVotesTable)
      .where(
        and(
          eq(leaderboardVotesTable.requesterId, requesterId),
          inArray(
            leaderboardVotesTable.entryId,
            rows.map((row) => row.id),
          ),
        ),
      )) as unknown as LeaderboardVote[];
  }

  return {
    items: attachViewerVote(rows as unknown as LeaderboardEntry[], votes, requesterId),
    total: Number(count),
  };
}

export async function getLeaderboardEntryBySlug(slug: string, requesterId?: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(leaderboardEntriesTable)
    .where(eq(leaderboardEntriesTable.slug, slug))
    .limit(1);
  if (!rows.length) return null;

  let votes: LeaderboardVote[] = [];
  if (requesterId) {
    votes = (await db
      .select()
      .from(leaderboardVotesTable)
      .where(
        and(
          eq(leaderboardVotesTable.entryId, rows[0].id),
          eq(leaderboardVotesTable.requesterId, requesterId),
        ),
      )) as unknown as LeaderboardVote[];
  }
  return attachViewerVote(rows as unknown as LeaderboardEntry[], votes, requesterId)[0] ?? null;
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
  const map = await getMapBySlug(mapSlug);
  if (!map) {
    throw new Error("Map not found.");
  }

  const cell = map.document.cells.find((item) => item.id === cellId);
  if (!cell || !["gap", "tension", "impossible"].includes(cell.status)) {
    throw new Error("Only visualized frontier cells can be published.");
  }
  if (!cell.visualization?.imageUrl) {
    throw new Error("Generate an image for this frontier cell before publishing it.");
  }

  const now = isoNow();
  const slug = buildLeaderboardSlug(map.slug, cell.id);
  const db = getDb();

  const existingRows = await db
    .select()
    .from(leaderboardEntriesTable)
    .where(
      and(eq(leaderboardEntriesTable.mapSlug, map.slug), eq(leaderboardEntriesTable.cellId, cell.id)),
    )
    .limit(1);
  const existing = (existingRows[0] as unknown as LeaderboardEntry | undefined) ?? null;
  const nextEntry: LeaderboardEntry = serializeLeaderboardEntry({
    id: existing?.id ?? `spotlight_${crypto.randomUUID()}`,
    slug: existing?.slug ?? slug,
    mapId: map.id,
    mapSlug: map.slug,
    mapTitle: map.title,
    topicFamily: map.topicFamily,
    cellId: cell.id,
    cellLabel: cell.label,
    coordinatesSnapshot: { ...cell.coordinates },
    imageUrl: cell.visualization.imageUrl,
    storyTitle,
    storySummary,
    createdAt: existing?.createdAt ?? now,
    publishedAt: now,
    score: existing?.score ?? 0,
    upvotes: existing?.upvotes ?? 0,
    downvotes: existing?.downvotes ?? 0,
  });

  if (existing) {
    await db
      .update(leaderboardEntriesTable)
      .set({
        mapId: nextEntry.mapId,
        mapSlug: nextEntry.mapSlug,
        mapTitle: nextEntry.mapTitle,
        topicFamily: nextEntry.topicFamily,
        cellId: nextEntry.cellId,
        cellLabel: nextEntry.cellLabel,
        coordinatesSnapshot: nextEntry.coordinatesSnapshot,
        imageUrl: nextEntry.imageUrl,
        storyTitle: nextEntry.storyTitle,
        storySummary: nextEntry.storySummary,
        publishedAt: new Date(nextEntry.publishedAt),
      })
      .where(eq(leaderboardEntriesTable.id, nextEntry.id));
  } else {
    await db.insert(leaderboardEntriesTable).values({
      id: nextEntry.id,
      slug: nextEntry.slug,
      mapId: nextEntry.mapId,
      mapSlug: nextEntry.mapSlug,
      mapTitle: nextEntry.mapTitle,
      topicFamily: nextEntry.topicFamily,
      cellId: nextEntry.cellId,
      cellLabel: nextEntry.cellLabel,
      coordinatesSnapshot: nextEntry.coordinatesSnapshot,
      imageUrl: nextEntry.imageUrl,
      storyTitle: nextEntry.storyTitle,
      storySummary: nextEntry.storySummary,
      score: nextEntry.score,
      upvotes: nextEntry.upvotes,
      downvotes: nextEntry.downvotes,
      createdAt: new Date(nextEntry.createdAt),
      publishedAt: new Date(nextEntry.publishedAt),
    });
  }

  return nextEntry;
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
    .from(leaderboardEntriesTable)
    .where(eq(leaderboardEntriesTable.slug, slug))
    .limit(1);
  if (!rows.length) return null;
  const entry = rows[0] as unknown as LeaderboardEntry;

  const updatedEntry = await db.transaction(async (tx) => {
    const existingVotes = (await tx
      .select()
      .from(leaderboardVotesTable)
      .where(
        and(
          eq(leaderboardVotesTable.entryId, entry.id),
          eq(leaderboardVotesTable.requesterId, requesterId),
        ),
      )
      .limit(1)) as unknown as LeaderboardVote[];

    if (direction === null) {
      await tx
        .delete(leaderboardVotesTable)
        .where(
          and(
            eq(leaderboardVotesTable.entryId, entry.id),
            eq(leaderboardVotesTable.requesterId, requesterId),
          ),
        );
    } else if (existingVotes.length) {
      await tx
        .update(leaderboardVotesTable)
        .set({
          direction,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(leaderboardVotesTable.entryId, entry.id),
            eq(leaderboardVotesTable.requesterId, requesterId),
          ),
        );
    } else {
      await tx.insert(leaderboardVotesTable).values({
        entryId: entry.id,
        requesterId,
        direction,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const votes = (await tx
      .select()
      .from(leaderboardVotesTable)
      .where(eq(leaderboardVotesTable.entryId, entry.id))) as unknown as LeaderboardVote[];
    const nextEntry = recalculateEntryScore(entry, votes);
    await tx
      .update(leaderboardEntriesTable)
      .set({
        score: nextEntry.score,
        upvotes: nextEntry.upvotes,
        downvotes: nextEntry.downvotes,
      })
      .where(eq(leaderboardEntriesTable.id, entry.id));

    return {
      ...nextEntry,
      viewerVote: votes.find((vote) => vote.requesterId === requesterId)?.direction ?? null,
    };
  });

  return serializeLeaderboardEntry(updatedEntry);
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
  const db = getDb();
  // "live" = public-facing (excludes failed). "library" = the user's own
  // sidebar/dashboard view, where failed attempts must remain visible so
  // they can be retried or deleted.
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
      items.push(serializeSavedMap(row as unknown as SavedMap));
    } catch (err) {
      console.error("[listMaps] skipping unreadable map row:", (row as { slug?: string })?.slug, err);
    }
  }

  return {
    items,
    total: Number(count),
  };
}

export async function getMapBySlug(slug: string) {
  const db = getDb();
  const rows = await db.select().from(mapsTable).where(eq(mapsTable.slug, slug)).limit(1);
  if (!rows.length) {
    return null;
  }

  return serializeSavedMap(rows[0] as unknown as SavedMap);
}

export async function deleteMapBySlug(slug: string) {
  const db = getDb();
  const existingMap = await getMapBySlug(slug);
  if (!existingMap) {
    return null;
  }

  const existingEntries = await db
    .select({ id: leaderboardEntriesTable.id })
    .from(leaderboardEntriesTable)
    .where(eq(leaderboardEntriesTable.mapSlug, slug));
  if (existingEntries.length) {
    await db
      .delete(leaderboardVotesTable)
      .where(
        inArray(
          leaderboardVotesTable.entryId,
          existingEntries.map((entry) => entry.id),
        ),
      );
    await db.delete(leaderboardEntriesTable).where(eq(leaderboardEntriesTable.mapSlug, slug));
  }
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
  await db.insert(mapsTable).values({
    id,
    slug,
    title: saved.title,
    domain: saved.domain,
    topicFamily: saved.topicFamily,
    status,
    summary: saved.summary,
    promptSummary: saved.promptSummary,
    document: saved.document,
    publishedAt: status === "published" ? new Date(saved.publishedAt ?? isoNow()) : null,
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

  return saved;
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
  },
): Promise<boolean> {
  const map = await getMapBySlug(slug);
  if (!map) {
    return false;
  }

  const document: MapDocument = {
    ...map.document,
    cells: map.document.cells.map((cell) =>
      cell.id === cellId ? { ...cell, visualization } : cell,
    ),
  };

  const db = getDb();
  await db.update(mapsTable).set({ document }).where(eq(mapsTable.slug, slug));
  return true;
}

/**
 * Builds an empty placeholder document used for reserved-but-not-yet-generated
 * maps. The map view renders this in `live` mode and tolerates the missing
 * pieces (dimensions, cells) until the generator backfills them.
 */
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

/**
 * Reserve a "generating" map row up front so the client can navigate to
 * `/maps/{slug}` immediately while generation continues in the background.
 * Returns the slug + id for the route handler to redirect to.
 */
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
    document: placeholder,
    revision: 0,
    publishedAt: null,
  });

  return { id, slug };
}

/**
 * Atomically merge a patch into the map's document, bump its revision, and
 * optionally update top-level status / publishedAt. Returns the new revision.
 *
 * Reads the current document, applies the mutator, writes it back. Generation
 * for a given map runs single-writer so no inter-process locking is needed.
 */
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

  const row = rows[0] as unknown as {
    document: MapDocument;
    revision: number | null;
    title: string;
    domain: string;
    topicFamily: string;
    summary: string;
  };
  const next = mutate(row.document);

  const patch: Record<string, unknown> = {
    document: next,
    revision: sql`${mapsTable.revision} + 1`,
  };
  if (next.title && next.title !== row.title) patch.title = next.title;
  if (next.domain && next.domain !== row.domain) patch.domain = next.domain;
  if (next.topicFamily && next.topicFamily !== row.topicFamily) patch.topicFamily = next.topicFamily;
  if (next.summary && next.summary !== row.summary) patch.summary = next.summary;
  if (status !== undefined) patch.status = status;
  if (publishedAtIso !== undefined) {
    patch.publishedAt = publishedAtIso === null ? null : new Date(publishedAtIso);
  }

  await db.update(mapsTable).set(patch).where(eq(mapsTable.id, mapId));

  const updated = await db
    .select({ revision: mapsTable.revision })
    .from(mapsTable)
    .where(eq(mapsTable.id, mapId))
    .limit(1);
  return { revision: updated[0]?.revision ?? (row.revision ?? 0) + 1 };
}

/**
 * Cheap read used by the live SSE poller to detect whether the map's document
 * has changed without re-fetching the full payload until it has.
 */
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
  await db.insert(generationRunsTable).values({
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
