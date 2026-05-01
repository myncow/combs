import { and, desc, eq, ne, sql } from "drizzle-orm";
import { appConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { generationRunsTable, mapsTable } from "@/lib/db/schema";
import { examplePrompts } from "@/lib/data/example-prompts";
import { seedBreadMap } from "@/lib/data/seed-maps";
import { seedTeaMap } from "@/lib/data/seed-tea-map";
import { applyPersistedUserMaps, readDevStoreFile, writeDevStoreFile } from "@/lib/dev-store";
import type { GenerationMetrics } from "@/lib/generation-metrics";
import type {
  ExamplePrompt,
  GenerationRun,
  ListedCellVisualization,
  MapCellVisualization,
  MapBrief,
  MapDocument,
  MapVisibility,
  NormalizedMapBrief,
  SavedMap,
} from "@/lib/types";
import { pickMapThumbnail, slugify } from "@/lib/utils";

const seededExamples = examplePrompts;

function isoNow() {
  return new Date().toISOString();
}

function coerceIsoString(value: unknown, fallback = isoNow()): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

const globalStore = globalThis as typeof globalThis & {
  __mapStudioMemory?: {
    maps: SavedMap[];
    runs: GenerationRun[];
    prompts: ExamplePrompt[];
    deletedSeedKeys: string[];
    hydrated?: boolean;
  };
};

function persistMemoryStore() {
  const store = globalStore.__mapStudioMemory;
  if (!store) return;
  writeDevStoreFile(store.maps, store.deletedSeedKeys);
}

function getMemoryStore() {
  if (!globalStore.__mapStudioMemory) {
    globalStore.__mapStudioMemory = {
      maps: [
        {
          id: "seed-bread",
          slug: "bread-map",
          title: "Bread Map",
          domain: "Bread",
          topicFamily: "Food & Drink",
          status: "published",
          publishedAt: "2026-04-20T10:00:00.000Z",
          createdAt: "2026-04-20T10:00:00.000Z",
          summary: "A map of breads across grain, fermentation, and cooking method.",
          promptSummary: seededExamples[0].prompt,
          document: {
            title: "Bread Map",
            slug: "bread-map",
            summary: "A map of breads across grain, fermentation, and cooking method.",
            intro:
              "Bread is a great mapping domain because chemistry, technique, and tradition all push against each other in visible ways.",
            domain: "Bread",
            topicFamily: "Food & Drink",
            dimensions: [
              {
                key: "grain",
                label: "Grain",
                description: "Base material family.",
                values: ["Wheat", "Rye", "Rice"],
              },
              {
                key: "fermentation",
                label: "Fermentation",
                description: "Leavening and aging logic.",
                values: ["None", "Yeast", "Sourdough"],
              },
            ],
            cellSchema: {
              primaryX: "grain",
              primaryY: "fermentation",
            },
            cells: [
              {
                id: "wheat-yeast",
                coordinates: { grain: "Wheat", fermentation: "Yeast", cooking: "Baked" },
                label: "Wheat + Yeast",
                status: "existing",
                explanation: "The dominant bread archetype.",
                confidence: 0.95,
                badges: ["Classic"],
                examples: [
                  {
                    name: "Baguette",
                    description: "High-recognition canonical example.",
                    coordinates: { grain: "Wheat", fermentation: "Yeast", cooking: "Baked" },
                    status: "existing",
                  },
                ],
              },
              {
                id: "rice-sourdough",
                coordinates: { grain: "Rice", fermentation: "Sourdough", cooking: "Steamed" },
                label: "Rice + Sourdough",
                status: "gap",
                explanation: "A plausible but under-developed category.",
                confidence: 0.63,
                badges: ["Opportunity"],
                examples: [],
              },
              {
                id: "rye-none",
                coordinates: { grain: "Rye", fermentation: "None", cooking: "Baked" },
                label: "Rye + Unfermented",
                status: "rare",
                explanation: "It exists, but it is not a default modern category.",
                confidence: 0.72,
                badges: ["Niche"],
                examples: [],
              },
              {
                id: "rice-deep-fried-sourdough",
                coordinates: { grain: "Rice", fermentation: "Sourdough", cooking: "Fried" },
                label: "Rice + Sourdough + Fried",
                status: "impossible",
                explanation: "The structure and process fight each other too hard to form a stable category.",
                confidence: 0.54,
                badges: ["Constraint"],
                examples: [],
              },
            ],
            featuredExamples: [
              {
                name: "Baguette",
                description: "A classic wheat + yeast example.",
                coordinates: { grain: "Wheat", fermentation: "Yeast", cooking: "Baked" },
                status: "existing",
              },
              {
                name: "Injera",
                description: "A fermentation-driven flatbread family.",
                coordinates: { grain: "Teff", fermentation: "Sourdough", cooking: "Griddled" },
                status: "rare",
              },
            ],
            notableGaps: [
              {
                label: "Rice + Sourdough",
                explanation: "Promising but not well normalized as a category.",
                coordinates: { grain: "Rice", fermentation: "Sourdough" },
              },
            ],
            impossibleCombos: [
              {
                label: "Rice + Sourdough + Fried",
                explanation: "Texture and process constraints make the cell unstable.",
                coordinates: { grain: "Rice", fermentation: "Sourdough", cooking: "Fried" },
              },
            ],
            constraints: [
              {
                label: "Gluten structure",
                kind: "physical",
                explanation: "Some bread families require enough structure to trap gas or hold shape.",
              },
              {
                label: "Regional lineage",
                kind: "cultural",
                explanation: "Many bread categories persist because they are socially legible and repeated.",
              },
            ],
            renderingHints: {
              accent: "#d97706",
              gradient: ["#fef3c7", "#fde68a"],
              icon: "grid",
            },
            seo: {
              title: "Bread Map | Lattice",
              description: "A map of bread combinations.",
            },
          },
        },
      ],
      runs: [],
      prompts: seededExamples,
      deletedSeedKeys: [],
    };
  }

  globalStore.__mapStudioMemory.deletedSeedKeys ??= [];

  if (!globalStore.__mapStudioMemory.hydrated) {
    const persisted = readDevStoreFile();
    if (persisted) {
      for (const key of persisted.deletedSeedKeys) {
        if (!globalStore.__mapStudioMemory.deletedSeedKeys.includes(key)) {
          globalStore.__mapStudioMemory.deletedSeedKeys.push(key);
        }
      }
      globalStore.__mapStudioMemory.maps = applyPersistedUserMaps(
        globalStore.__mapStudioMemory.maps,
        persisted.maps,
      );
    }
    globalStore.__mapStudioMemory.hydrated = true;
  }

  for (const seedMap of [seedBreadMap, seedTeaMap]) {
    if (globalStore.__mapStudioMemory.deletedSeedKeys.includes(seedMap.id) || globalStore.__mapStudioMemory.deletedSeedKeys.includes(seedMap.slug)) {
      continue;
    }

    const seedIndex = globalStore.__mapStudioMemory.maps.findIndex((map) => map.id === seedMap.id || map.slug === seedMap.slug);
    if (seedIndex >= 0) {
      globalStore.__mapStudioMemory.maps[seedIndex] = seedMap;
    } else {
      globalStore.__mapStudioMemory.maps.unshift(seedMap);
    }
  }

  globalStore.__mapStudioMemory.prompts = seededExamples;
  return globalStore.__mapStudioMemory;
}

function serializeSavedMap(record: SavedMap): SavedMap {
  return {
    ...record,
    thumbnailUrl: record.document ? pickMapThumbnail(record.document) : null,
  };
}

export async function listExamplePrompts() {
  return seededExamples;
}

export async function listMaps({
  topicFamily,
  status = "published",
  page = 1,
  pageSize = 9,
}: {
  topicFamily?: string;
  status?: MapVisibility;
  page?: number;
  pageSize?: number;
}) {
  const db = getDb();
  if (!db) {
    let results = getMemoryStore().maps.filter((map) => map.status === status);
    if (topicFamily && topicFamily !== "All") {
      results = results.filter((map) => map.topicFamily === topicFamily);
    }
    results = results.sort((a, b) => ((a.publishedAt ?? a.createdAt) < (b.publishedAt ?? b.createdAt) ? 1 : -1));
    const start = (page - 1) * pageSize;
    return {
      items: results.slice(start, start + pageSize).map(serializeSavedMap),
      total: results.length,
    };
  }

  const conditions = [eq(mapsTable.status, status)];
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

  return {
    items: rows.map((row) => serializeSavedMap(row as unknown as SavedMap)),
    total: Number(count),
  };
}

const VISUAL_GENERATIONS_PAGE_SIZE = 200;

export async function listVisualGenerations(): Promise<ListedCellVisualization[]> {
  const db = getDb();
  const maps: SavedMap[] = [];

  if (!db) {
    maps.push(...getMemoryStore().maps.filter((m) => m.status !== "failed"));
  } else {
    let offset = 0;
    while (true) {
      const rows = await db
        .select()
        .from(mapsTable)
        .where(ne(mapsTable.status, "failed"))
        .limit(VISUAL_GENERATIONS_PAGE_SIZE)
        .offset(offset);
      if (!rows.length) break;
      for (const row of rows) {
        maps.push(serializeSavedMap(row as unknown as SavedMap));
      }
      if (rows.length < VISUAL_GENERATIONS_PAGE_SIZE) break;
      offset += VISUAL_GENERATIONS_PAGE_SIZE;
    }
  }

  const out: ListedCellVisualization[] = [];
  for (const map of maps) {
    const cells = Array.isArray(map.document?.cells) ? map.document.cells : [];
    for (const cell of cells) {
      const viz = cell.visualization as MapCellVisualization | undefined;
      if (!viz?.imageUrl) continue;
      const mapUpdatedAt = coerceIsoString(map.publishedAt ?? map.createdAt);
      out.push({
        mapSlug: map.slug,
        mapTitle: map.title,
        cellId: cell.id,
        cellLabel: cell.label,
        status: cell.status,
        imageUrl: viz.imageUrl,
        caption: viz.caption,
        updatedAt: coerceIsoString(viz.updatedAt, mapUpdatedAt),
        coordinatesSnapshot: { ...cell.coordinates },
      });
    }
  }

  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export async function getMapBySlug(slug: string) {
  const db = getDb();
  if (!db) {
    const match = getMemoryStore().maps.find((map) => map.slug === slug);
    return match ? serializeSavedMap(match) : null;
  }

  const rows = await db.select().from(mapsTable).where(eq(mapsTable.slug, slug)).limit(1);
  if (!rows.length) {
    return null;
  }

  return serializeSavedMap(rows[0] as unknown as SavedMap);
}

export async function deleteMapBySlug(slug: string) {
  const db = getDb();
  if (!db) {
    const store = getMemoryStore();
    const deletedSeedKeys = new Set(store.deletedSeedKeys);
    const deleteIndex = store.maps.findIndex((map) => map.slug === slug);

    if (deleteIndex < 0) {
      return null;
    }

    const [deletedMap] = store.maps.splice(deleteIndex, 1);
    const seedMap = [seedBreadMap, seedTeaMap].find(
      (map) => map.id === deletedMap.id || map.slug === deletedMap.slug,
    );

    if (seedMap) {
      deletedSeedKeys.add(seedMap.id);
      deletedSeedKeys.add(seedMap.slug);
      store.deletedSeedKeys = [...deletedSeedKeys];
    }

    persistMemoryStore();
    return deletedMap;
  }

  const existingMap = await getMapBySlug(slug);
  if (!existingMap) {
    return null;
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
  if (!db) {
    getMemoryStore().maps.unshift(saved);
    persistMemoryStore();
    return saved;
  }

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
  visualization: { imageUrl: string; caption?: string; updatedAt: string },
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
  if (!db) {
    const store = getMemoryStore();
    const index = store.maps.findIndex((m) => m.slug === slug);
    if (index < 0) {
      return false;
    }
    store.maps[index] = { ...store.maps[index], document };
    persistMemoryStore();
    return true;
  }

  await db.update(mapsTable).set({ document }).where(eq(mapsTable.slug, slug));
  return true;
}

export async function logGenerationRun(run: GenerationRun) {
  const db = getDb();
  if (!db) {
    getMemoryStore().runs.unshift(run);
    return;
  }

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
