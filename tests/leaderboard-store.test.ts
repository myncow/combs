import { isLeaderboardStoreTestDbConfigured } from "./ensure-db-url-for-store-tests";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const materializeCellImageAssetMock = vi.fn();

vi.mock("@/lib/cell-visualization-storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cell-visualization-storage")>(
    "@/lib/cell-visualization-storage",
  );
  return {
    ...actual,
    materializeCellImageAsset: (...args: Parameters<typeof actual.materializeCellImageAsset>) =>
      materializeCellImageAssetMock(...args),
  };
});

import { resetDbClientForTests, getDb } from "@/lib/db/client";
import {
  applyMapPatch,
  castLeaderboardVote,
  getLeaderboardEntryBySlug,
  getMapBySlug,
  listLeaderboardEntries,
  patchMapCellVisualization,
  publishGapSpotlight,
  saveMap,
} from "@/lib/store";
import { mapsTable, spotlightsTable, spotlightVotesTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { MapBrief, MapDocument, NormalizedMapBrief } from "@/lib/types";
import { testBreadMapDocument } from "./fixtures/bread-map-document";

async function truncateStoreTables() {
  const db = getDb();
  await db.execute(
    sql.raw(
      "TRUNCATE spotlight_votes, spotlights, map_generation_runs, media_assets, map_example_reference_images, map_featured_examples, map_examples, map_cell_badges, map_cell_coordinates, map_callouts, map_constraints, map_cells, map_axis_values, map_axes, maps RESTART IDENTITY CASCADE",
    ),
  );
}

function briefFixture(): MapBrief {
  return {
    topic: "Bread Frontiers",
    combines: "grains and leavening",
    candidateDimensions: [],
    inferDimensions: true,
    audience: "Curious enthusiasts",
    tone: "Editorial and exploratory",
    mustIncludeExamples: [],
    mustAvoid: [],
    extraContext: "Keep it grounded.",
  };
}

function normalizedBriefFixture(topicFamily = "Food & Drink"): NormalizedMapBrief {
  return {
    ...briefFixture(),
    domain: "Bread Frontiers",
    topicFamily,
    dimensions: [
      { key: "grain-base", label: "Grain Base", description: "Primary starch family." },
      { key: "fermentation-style", label: "Fermentation Style", description: "How lift is achieved." },
    ],
    accepted: true,
    guidance: ["ok"],
  };
}

function clonedDocument(title: string, slug: string, topicFamily: string): MapDocument {
  const document = structuredClone(testBreadMapDocument);
  document.title = title;
  document.slug = slug;
  document.topicFamily = topicFamily;
  document.summary = `${title} summary`;
  document.seo = {
    title: `${title} | Raster`,
    description: `${title} description`,
  };
  return document;
}

describe.skipIf(!isLeaderboardStoreTestDbConfigured)("leaderboard store", () => {
  afterAll(async () => {
    await resetDbClientForTests();
  });

  beforeEach(async () => {
    materializeCellImageAssetMock.mockReset();
    await truncateStoreTables();
    await saveMap({
      brief: briefFixture(),
      normalizedBrief: normalizedBriefFixture(),
      document: testBreadMapDocument,
      status: "published",
    });
  });

  it("publishes a denormalized gap spotlight from a visualized gap cell", async () => {
    await patchMapCellVisualization("bread-map", "rice-sourdough", {
      imageUrl: "https://images.test/rice-gap.jpg",
      updatedAt: "2026-05-04T00:00:00.000Z",
      caption: "Rice chemistry frontier",
    });

    const entry = await publishGapSpotlight({
      mapSlug: "bread-map",
      cellId: "rice-sourdough",
      storyTitle: "Chemical rice breads deserve a category of their own",
      storySummary: "A modern, technically plausible gap where process innovation could make a new staple legible.",
    });

    expect(entry.mapSlug).toBe("bread-map");
    expect(entry.cellId).toBe("rice-sourdough");
    expect(entry.imageUrl).toBe("https://images.test/rice-gap.jpg");

    const listed = await listLeaderboardEntries({ sort: "new", requesterId: "viewer-a" });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.storyTitle).toBe(entry.storyTitle);
    expect(listed.items[0]?.viewerVote).toBeNull();

    const detail = await getLeaderboardEntryBySlug(entry.slug, "viewer-a");
    expect(detail?.storySummary).toContain("technically plausible");
    expect(detail?.mapTitle).toBe("Bread Map");
  });

  it("persists a generated visualization so it survives a fresh map read", async () => {
    await patchMapCellVisualization("bread-map", "rice-sourdough", {
      imageUrl: "https://assets.public.blob.vercel-storage.com/generated-cell-viz/bread/rice.png",
      updatedAt: "2026-05-04T00:00:00.000Z",
      caption: "Rice chemistry frontier",
      provider: "vercel_blob",
      storageKey: "generated-cell-viz/bread/rice.png",
      mimeType: "image/png",
      byteSize: 8192,
      byteHash: "a".repeat(64),
    });

    const map = await getMapBySlug("bread-map");
    const cell = map?.document.cells.find((entry) => entry.id === "rice-sourdough");

    expect(cell?.visualization?.imageUrl).toBe(
      "https://assets.public.blob.vercel-storage.com/generated-cell-viz/bread/rice.png",
    );
    expect(cell?.visualization?.caption).toBe("Rice chemistry frontier");
    expect(cell?.visualization?.byteHash).toBe("a".repeat(64));
  });

  it("materializes inline data-url visualizations before persisting media assets", async () => {
    materializeCellImageAssetMock.mockResolvedValueOnce({
      url: "https://assets.public.blob.vercel-storage.com/generated-cell-viz/bread-map/rice-sourdough.png",
      provider: "vercel_blob",
      storageKey: "generated-cell-viz/bread-map/rice-sourdough.png",
      mimeType: "image/png",
      byteHash: "b".repeat(64),
      byteSize: 8192,
    });

    await patchMapCellVisualization("bread-map", "rice-sourdough", {
      imageUrl: "data:image/png;base64,AAAA",
      updatedAt: "2026-05-04T00:00:00.000Z",
      caption: "Rice chemistry frontier",
    });

    expect(materializeCellImageAssetMock).toHaveBeenCalledWith(
      "bread-map",
      "rice-sourdough",
      "data:image/png;base64,AAAA",
    );

    const map = await getMapBySlug("bread-map");
    const cell = map?.document.cells.find((entry) => entry.id === "rice-sourdough");

    expect(cell?.visualization?.imageUrl).toBe(
      "https://assets.public.blob.vercel-storage.com/generated-cell-viz/bread-map/rice-sourdough.png",
    );
    expect(cell?.visualization?.byteHash).toBe("b".repeat(64));
  });

  it("publishes multiple visualized frontier cells from the same map", async () => {
    const doc = clonedDocument("Many Frontiers Bread", "many-frontiers-bread", "Food & Drink");
    doc.cells = doc.cells.map((cell) =>
      cell.id === "rice-chemical" ? { ...cell, status: "tension" as const } : cell,
    );
    await saveMap({
      brief: briefFixture(),
      normalizedBrief: normalizedBriefFixture(),
      document: doc,
      status: "published",
    });

    await patchMapCellVisualization("many-frontiers-bread", "rice-sourdough", {
      imageUrl: "https://images.test/rice-gap.jpg",
      updatedAt: "2026-05-04T00:00:00.000Z",
    });
    await patchMapCellVisualization("many-frontiers-bread", "rice-chemical", {
      imageUrl: "https://images.test/rice-tension.jpg",
      updatedAt: "2026-05-04T00:00:01.000Z",
    });

    const gapEntry = await publishGapSpotlight({
      mapSlug: "many-frontiers-bread",
      cellId: "rice-sourdough",
      storyTitle: "Rice sourdough deserves a spotlight",
      storySummary: "A plausible gap with a generated image.",
    });
    const tensionEntry = await publishGapSpotlight({
      mapSlug: "many-frontiers-bread",
      cellId: "rice-chemical",
      storyTitle: "Rice chemical lift has a visual edge",
      storySummary: "A tense frontier cell with its own generated image.",
    });

    expect(gapEntry.slug).not.toBe(tensionEntry.slug);
    expect(gapEntry.imageUrl).toBe("https://images.test/rice-gap.jpg");
    expect(tensionEntry.imageUrl).toBe("https://images.test/rice-tension.jpg");

    const listed = await listLeaderboardEntries({ sort: "new" });
    expect(listed.total).toBe(2);
    expect(listed.items.map((entry) => entry.cellId)).toEqual(
      expect.arrayContaining(["rice-sourdough", "rice-chemical"]),
    );
  });

  it("preserves cell ids across applyMapPatch so spotlights and votes survive a re-edit", async () => {
    await patchMapCellVisualization("bread-map", "rice-sourdough", {
      imageUrl: "https://images.test/rice-sourdough-survives.jpg",
      updatedAt: "2026-05-04T00:00:00.000Z",
    });

    const spotlight = await publishGapSpotlight({
      mapSlug: "bread-map",
      cellId: "rice-sourdough",
      storyTitle: "Survives an edit",
      storySummary: "This spotlight must remain after the map is patched.",
    });

    await castLeaderboardVote({
      slug: spotlight.slug,
      requesterId: "viewer-survives",
      direction: "up",
    });

    const db = getDb();
    const mapRow = await db.select().from(mapsTable).where(eq(mapsTable.slug, "bread-map")).limit(1);
    const mapId = mapRow[0]!.id;

    await applyMapPatch({
      mapId,
      mutate: (current) => ({
        ...current,
        summary: "Patched after spotlight publish.",
      }),
    });

    const stillThere = await getLeaderboardEntryBySlug(spotlight.slug, "viewer-survives");
    expect(stillThere).not.toBeNull();
    expect(stillThere!.imageUrl).toBe("https://images.test/rice-sourdough-survives.jpg");

    const votes = await db
      .select()
      .from(spotlightVotesTable)
      .where(eq(spotlightVotesTable.spotlightId, spotlight.id));
    expect(votes).toHaveLength(1);
    expect(votes[0]!.direction).toBe("up");

    void spotlightsTable;
  });

  it("supports anonymous vote mutation plus top/new sorting and topic-family filtering", async () => {
    await patchMapCellVisualization("bread-map", "rice-sourdough", {
      imageUrl: "https://images.test/bread-gap.jpg",
      updatedAt: "2026-05-04T00:00:00.000Z",
    });
    const first = await publishGapSpotlight({
      mapSlug: "bread-map",
      cellId: "rice-sourdough",
      storyTitle: "Rice chemistry frontier",
      storySummary: "A compelling underbuilt category.",
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const saved = await saveMap({
      brief: briefFixture(),
      normalizedBrief: normalizedBriefFixture("Experimental Food"),
      document: clonedDocument("Future Bread", "future-bread", "Experimental Food"),
      status: "published",
    });
    await patchMapCellVisualization(saved.slug, "rice-chemical", {
      imageUrl: "https://images.test/future-gap.jpg",
      updatedAt: "2026-05-04T00:00:01.000Z",
    });
    const second = await publishGapSpotlight({
      mapSlug: saved.slug,
      cellId: "rice-chemical",
      storyTitle: "Future bread gap",
      storySummary: "A newer spotlight for sorting checks.",
    });

    const upvoted = await castLeaderboardVote({
      slug: first.slug,
      requesterId: "viewer-a",
      direction: "up",
    });
    expect(upvoted?.score).toBe(1);
    expect(upvoted?.viewerVote).toBe("up");

    const switched = await castLeaderboardVote({
      slug: first.slug,
      requesterId: "viewer-a",
      direction: "down",
    });
    expect(switched?.score).toBe(-1);
    expect(switched?.upvotes).toBe(0);
    expect(switched?.downvotes).toBe(1);

    const cleared = await castLeaderboardVote({
      slug: first.slug,
      requesterId: "viewer-a",
      direction: null,
    });
    expect(cleared?.score).toBe(0);
    expect(cleared?.viewerVote).toBeNull();

    await castLeaderboardVote({
      slug: first.slug,
      requesterId: "viewer-b",
      direction: "up",
    });

    const top = await listLeaderboardEntries({ sort: "top", requesterId: "viewer-b" });
    expect(top.items[0]?.slug).toBe(first.slug);

    const newest = await listLeaderboardEntries({ sort: "new", requesterId: "viewer-b" });
    expect(newest.items[0]?.slug).toBe(second.slug);

    const filtered = await listLeaderboardEntries({
      sort: "new",
      topicFamily: "Experimental Food",
      requesterId: "viewer-b",
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.mapSlug).toBe(saved.slug);
  });
});
