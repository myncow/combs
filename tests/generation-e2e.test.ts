import { isLeaderboardStoreTestDbConfigured } from "./ensure-db-url-for-store-tests";
import { sql, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const buildMapJobMock = vi.fn();
const enrichPublishedMapMock = vi.fn();

vi.mock("@/lib/map-engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/map-engine")>(
    "@/lib/map-engine",
  );
  return {
    ...actual,
    buildMapJob: (...args: Parameters<typeof actual.buildMapJob>) => buildMapJobMock(...args),
    enrichPublishedMap: (...args: Parameters<typeof actual.enrichPublishedMap>) =>
      enrichPublishedMapMock(...args),
  };
});

import { resetDbClientForTests, getDb } from "@/lib/db/client";
import { mapsTable, mapGenerationRunsTable, mapCellsTable } from "@/lib/db/schema";
import { reserveMap } from "@/lib/store";
import { runMapGenerationCore } from "@/lib/map-generation-runner";
import { testBreadMapDocument } from "./fixtures/bread-map-document";
import type { MapBrief, NormalizedMapBrief } from "@/lib/types";

async function truncate() {
  const db = getDb();
  await db.execute(
    sql.raw(
      "TRUNCATE spotlight_votes, spotlights, map_generation_runs, media_assets, map_example_reference_images, map_featured_examples, map_examples, map_cell_badges, map_cell_coordinates, map_callouts, map_constraints, map_cells, map_axis_values, map_axes, maps RESTART IDENTITY CASCADE",
    ),
  );
}

function brief(): MapBrief {
  return {
    topic: "Bread Frontiers E2E",
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

function normalizedBrief(): NormalizedMapBrief {
  return {
    ...brief(),
    domain: "Bread Frontiers E2E",
    topicFamily: "Food & Drink",
    dimensions: [
      { key: "grain-base", label: "Grain Base", description: "Primary starch family." },
      { key: "fermentation-style", label: "Fermentation Style", description: "How lift is achieved." },
    ],
    accepted: true,
    guidance: ["ok"],
  };
}

describe.skipIf(!isLeaderboardStoreTestDbConfigured)("generation-runner e2e", () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  afterAll(async () => {
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    await resetDbClientForTests();
  });

  beforeEach(async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    buildMapJobMock.mockReset();
    enrichPublishedMapMock.mockReset();
    await truncate();
  });

  it("reserves a map, runs the generator, flips status to published, and logs a success run", async () => {
    const reserved = await reserveMap({ brief: brief(), ownerId: "test-user" });

    buildMapJobMock.mockResolvedValue({
      result: { status: "success" },
      normalizedBrief: normalizedBrief(),
      document: { ...testBreadMapDocument, slug: reserved.slug },
    });
    enrichPublishedMapMock.mockImplementation(async (doc: unknown) => doc);

    const outcome = await runMapGenerationCore(brief(), {
      reservedMap: reserved,
      ownerId: "test-user",
    });

    expect(outcome.outcome).toBe("success");
    if (outcome.outcome === "success") {
      expect(outcome.slug).toBe(reserved.slug);
    }

    const db = getDb();
    const rows = await db
      .select({ status: mapsTable.status, slug: mapsTable.slug })
      .from(mapsTable)
      .where(eq(mapsTable.id, reserved.id));
    expect(rows[0]?.status).toBe("published");

    const cells = await db
      .select({ id: mapCellsTable.id })
      .from(mapCellsTable)
      .where(eq(mapCellsTable.mapId, reserved.id));
    expect(cells.length).toBe(testBreadMapDocument.cells.length);

    const runs = await db
      .select({ status: mapGenerationRunsTable.status })
      .from(mapGenerationRunsTable)
      .where(eq(mapGenerationRunsTable.mapId, reserved.id));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("success");
  });
});
