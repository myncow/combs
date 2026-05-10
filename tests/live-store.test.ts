import { isLeaderboardStoreTestDbConfigured } from "./ensure-db-url-for-store-tests";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDbClientForTests, getDb } from "@/lib/db/client";
import { applyMapPatch, getMapRevisionState, reserveMap } from "@/lib/store";
import type { MapBrief } from "@/lib/types";

async function truncateMaps() {
  const db = getDb();
  await db.execute(
    sql.raw(
      "TRUNCATE spotlight_votes, spotlights, map_generation_runs, media_assets, map_example_reference_images, map_featured_examples, map_examples, map_cell_badges, map_cell_coordinates, map_callouts, map_constraints, map_cells, map_axis_values, map_axes, maps RESTART IDENTITY CASCADE",
    ),
  );
}

function briefFixture(topic = "Live Reserve Topic"): MapBrief {
  return {
    topic,
    combines: "",
    candidateDimensions: [],
    inferDimensions: true,
    audience: "Curious enthusiasts",
    tone: "Editorial and exploratory",
    mustIncludeExamples: [],
    mustAvoid: [],
    extraContext: undefined,
  };
}

describe.skipIf(!isLeaderboardStoreTestDbConfigured)("live generation store helpers", () => {
  afterAll(async () => {
    await resetDbClientForTests();
  });

  beforeEach(async () => {
    await truncateMaps();
  });

  it("reserveMap inserts a generating row and returns its slug", async () => {
    const reserved = await reserveMap({ brief: briefFixture("Bread Frontiers") });

    expect(reserved.slug).toMatch(/^bread-frontiers/);
    expect(reserved.id).toMatch(/^map_/);

    const meta = await getMapRevisionState(reserved.slug);
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe("generating");
    expect(meta!.revision).toBe(0);
  });

  it("reserveMap auto-suffixes a duplicate slug rather than failing", async () => {
    const a = await reserveMap({ brief: briefFixture("Coffee Bars") });
    const b = await reserveMap({ brief: briefFixture("Coffee Bars") });

    expect(a.slug).not.toBe(b.slug);
    expect(b.slug.startsWith("coffee-bars")).toBe(true);
  });

  it("applyMapPatch increments revision and merges document fields", async () => {
    const reserved = await reserveMap({ brief: briefFixture("Knife Profiles") });

    const r1 = await applyMapPatch({
      mapId: reserved.id,
      mutate: (current) => ({
        ...current,
        title: "Knife Profiles — Live Edit",
        domain: "Cutlery",
        topicFamily: "Tools",
      }),
    });
    expect(r1).not.toBeNull();
    expect(r1!.revision).toBe(1);

    const r2 = await applyMapPatch({
      mapId: reserved.id,
      mutate: (current) => ({ ...current, summary: "Two anchors and a frontier." }),
    });
    expect(r2!.revision).toBe(2);

    const meta = await getMapRevisionState(reserved.slug);
    expect(meta!.revision).toBe(2);
  });

  it("applyMapPatch can flip status and stamp publishedAt", async () => {
    const reserved = await reserveMap({ brief: briefFixture("Wristwear") });

    const result = await applyMapPatch({
      mapId: reserved.id,
      mutate: (current) => current,
      status: "published",
      publishedAtIso: new Date("2026-05-05T00:00:00.000Z").toISOString(),
    });

    expect(result!.revision).toBe(1);

    const meta = await getMapRevisionState(reserved.slug);
    expect(meta!.status).toBe("published");
  });
});
