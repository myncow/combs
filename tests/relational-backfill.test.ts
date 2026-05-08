import { isLeaderboardStoreTestDbConfigured } from "./ensure-db-url-for-store-tests";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbClientForTests } from "@/lib/db/client";
import {
  legacyLeaderboardEntriesTable,
  legacyLeaderboardVotesTable,
  mapsTable,
} from "@/lib/db/schema";
import {
  backfillRelationalContent,
  getLeaderboardEntryBySlug,
  getMapBySlug,
} from "@/lib/store";
import { testBreadMapDocument } from "./fixtures/bread-map-document";

async function truncateAll() {
  const db = getDb();
  await db.execute(
    sql.raw(
      "TRUNCATE spotlight_votes, spotlights, map_generation_runs, media_assets, map_example_reference_images, map_featured_examples, map_examples, map_cell_badges, map_cell_coordinates, map_callouts, map_constraints, map_cells, map_axis_values, map_axes, leaderboard_votes, leaderboard_entries, generation_runs, maps RESTART IDENTITY CASCADE",
    ),
  );
}

describe.skipIf(!isLeaderboardStoreTestDbConfigured)("relational backfill", () => {
  afterAll(async () => {
    await resetDbClientForTests();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it("hydrates legacy document rows and leaderboard rows into the new relational tables", async () => {
    const db = getDb();
    await db.insert(mapsTable).values({
      id: "map_legacy",
      slug: "bread-map",
      title: testBreadMapDocument.title,
      domain: testBreadMapDocument.domain,
      topicFamily: testBreadMapDocument.topicFamily,
      status: "published",
      summary: testBreadMapDocument.summary,
      promptSummary: "legacy prompt",
      intro: "",
      seoTitle: "",
      seoDescription: "",
      document: {
        ...testBreadMapDocument,
        cells: testBreadMapDocument.cells.map((cell) =>
          cell.id === "rice-sourdough"
            ? {
                ...cell,
                visualization: {
                  imageUrl: "https://images.test/legacy-gap.jpg",
                  caption: "Legacy gap image",
                  updatedAt: "2026-05-08T00:00:00.000Z",
                },
              }
            : cell,
        ),
      },
      renderingHints: null,
      visualSeries: null,
      publishedAt: new Date("2026-05-08T00:00:00.000Z"),
    });

    await db.insert(legacyLeaderboardEntriesTable).values({
      id: "spotlight_legacy",
      slug: "bread-map-rice-sourdough",
      mapId: "map_legacy",
      mapSlug: "bread-map",
      mapTitle: "Bread Map",
      topicFamily: "Food & Drink",
      cellId: "rice-sourdough",
      cellLabel: "Rice + Sourdough",
      coordinatesSnapshot: { grain: "Rice", fermentation: "Sourdough" },
      imageUrl: "https://images.test/legacy-gap.jpg",
      storyTitle: "Legacy frontier",
      storySummary: "Legacy spotlight summary.",
      score: 1,
      upvotes: 1,
      downvotes: 0,
      createdAt: new Date("2026-05-08T00:00:00.000Z"),
      publishedAt: new Date("2026-05-08T00:00:00.000Z"),
    });
    await db.insert(legacyLeaderboardVotesTable).values({
      entryId: "spotlight_legacy",
      requesterId: "viewer-a",
      direction: "up",
      createdAt: new Date("2026-05-08T00:00:00.000Z"),
      updatedAt: new Date("2026-05-08T00:00:00.000Z"),
    });

    await backfillRelationalContent();

    const map = await getMapBySlug("bread-map");
    expect(map).not.toBeNull();
    expect(map?.document.cells.find((cell) => cell.id === "rice-sourdough")?.visualization?.imageUrl).toBe(
      "https://images.test/legacy-gap.jpg",
    );
    expect(map?.document.featuredExamples.length).toBe(2);

    const spotlight = await getLeaderboardEntryBySlug("bread-map-rice-sourdough", "viewer-a");
    expect(spotlight?.storyTitle).toBe("Legacy frontier");
    expect(spotlight?.viewerVote).toBe("up");
    expect(spotlight?.imageUrl).toBe("https://images.test/legacy-gap.jpg");
  });
});
