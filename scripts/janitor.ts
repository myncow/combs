import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

loadEnv({ path: resolve(process.cwd(), ".env") });
const vercelEnv = resolve(process.cwd(), ".vercel/.env.production.local");
if (existsSync(vercelEnv)) loadEnv({ path: vercelEnv });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { del as deleteBlob } from "@vercel/blob";
import { getDb, resetDbClientForTests } from "@/lib/db/client";
import {
  mapCellsTable,
  mapsTable,
  mediaAssetsTable,
  spotlightsTable,
} from "@/lib/db/schema";

const STALE_GENERATING_MINUTES = 10;
const STALE_GENERATING_MESSAGE = `Generation timed out (no completion within ${STALE_GENERATING_MINUTES} minutes).`;

async function pruneOrphanMediaAssets({ dryRun }: { dryRun: boolean }) {
  const db = getDb();
  const orphans: Array<{ id: string; provider: string; publicUrl: string }> = await db.execute(sql`
    SELECT a.id, a.provider, a.public_url AS "publicUrl"
    FROM media_assets a
    LEFT JOIN map_cells c ON c.visualization_asset_id = a.id
    LEFT JOIN spotlights s ON s.image_asset_id = a.id
    WHERE c.id IS NULL AND s.id IS NULL
  `) as unknown as Array<{ id: string; provider: string; publicUrl: string }>;

  if (orphans.length === 0) {
    console.log("[janitor] no orphan media_assets");
    return;
  }

  console.log(`[janitor] orphan media_assets: ${orphans.length}`);
  for (const row of orphans) {
    console.log(`  - ${row.id}  ${row.provider}  ${row.publicUrl}`);
  }

  if (dryRun) return;

  const blobUrls = orphans
    .filter((row) => row.provider === "vercel_blob")
    .map((row) => row.publicUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  if (blobUrls.length) {
    try {
      await deleteBlob(blobUrls);
      console.log(`[janitor] deleted ${blobUrls.length} blob(s)`);
    } catch (error) {
      console.error("[janitor] blob delete failed:", error);
    }
  }

  const ids = orphans.map((row) => row.id);
  await db
    .delete(mediaAssetsTable)
    .where(sql`${mediaAssetsTable.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  console.log(`[janitor] deleted ${ids.length} media_asset row(s)`);
}

async function sweepStaleGeneratingMaps({ dryRun }: { dryRun: boolean }) {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_GENERATING_MINUTES * 60 * 1000);
  const stale = await db
    .select({ id: mapsTable.id, slug: mapsTable.slug, updatedAt: mapsTable.updatedAt })
    .from(mapsTable)
    .where(and(eq(mapsTable.status, "generating"), lt(mapsTable.updatedAt, cutoff)));

  if (stale.length === 0) {
    console.log("[janitor] no stale 'generating' maps");
    return;
  }

  console.log(`[janitor] stale 'generating' maps: ${stale.length}`);
  for (const row of stale) {
    console.log(`  - ${row.id}  ${row.slug}  updated_at=${row.updatedAt.toISOString()}`);
  }

  if (dryRun) return;

  await db
    .update(mapsTable)
    .set({
      status: "failed",
      summary: STALE_GENERATING_MESSAGE,
      updatedAt: new Date(),
    })
    .where(and(eq(mapsTable.status, "generating"), lt(mapsTable.updatedAt, cutoff)));
  console.log(`[janitor] marked ${stale.length} map(s) as failed`);
}

// Silence unused-import warnings; these are referenced by raw SQL above.
void mapCellsTable;
void spotlightsTable;
void isNull;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[janitor] dry-run mode (no writes)");

  await pruneOrphanMediaAssets({ dryRun });
  await sweepStaleGeneratingMaps({ dryRun });

  await resetDbClientForTests();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
