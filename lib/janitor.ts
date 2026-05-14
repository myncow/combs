import { and, eq, lt, sql } from "drizzle-orm";
import { del as deleteBlob } from "@vercel/blob";
import { getDb } from "@/lib/db/client";
import { mapsTable, mediaAssetsTable } from "@/lib/db/schema";

const STALE_GENERATING_MINUTES = 10;
const STALE_GENERATING_MESSAGE = `Generation timed out (no completion within ${STALE_GENERATING_MINUTES} minutes).`;

export type JanitorReport = {
  orphanMediaAssets: { found: number; deleted: number };
  staleGeneratingMaps: { found: number; failed: number };
};

export async function pruneOrphanMediaAssets({ dryRun }: { dryRun: boolean }) {
  const db = getDb();
  const orphans: Array<{ id: string; provider: string; publicUrl: string }> = (await db.execute(sql`
    SELECT a.id, a.provider, a.public_url AS "publicUrl"
    FROM media_assets a
    LEFT JOIN map_cells c ON c.visualization_asset_id = a.id
    LEFT JOIN spotlights s ON s.image_asset_id = a.id
    WHERE c.id IS NULL AND s.id IS NULL
  `)) as unknown as Array<{ id: string; provider: string; publicUrl: string }>;

  if (orphans.length === 0 || dryRun) {
    return { found: orphans.length, deleted: 0 };
  }

  const blobUrls = orphans
    .filter((row) => row.provider === "vercel_blob")
    .map((row) => row.publicUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  if (blobUrls.length) {
    try {
      await deleteBlob(blobUrls);
    } catch (error) {
      console.error("[janitor] blob delete failed:", error);
    }
  }

  const ids = orphans.map((row) => row.id);
  await db
    .delete(mediaAssetsTable)
    .where(sql`${mediaAssetsTable.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);

  return { found: orphans.length, deleted: ids.length };
}

export async function sweepStaleGeneratingMaps({ dryRun }: { dryRun: boolean }) {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_GENERATING_MINUTES * 60 * 1000);
  const stale = await db
    .select({ id: mapsTable.id, slug: mapsTable.slug, updatedAt: mapsTable.updatedAt })
    .from(mapsTable)
    .where(and(eq(mapsTable.status, "generating"), lt(mapsTable.updatedAt, cutoff)));

  if (stale.length === 0 || dryRun) {
    return { found: stale.length, failed: 0 };
  }

  await db
    .update(mapsTable)
    .set({
      status: "failed",
      summary: STALE_GENERATING_MESSAGE,
      updatedAt: new Date(),
    })
    .where(and(eq(mapsTable.status, "generating"), lt(mapsTable.updatedAt, cutoff)));

  return { found: stale.length, failed: stale.length };
}

export async function runJanitor({ dryRun }: { dryRun: boolean }): Promise<JanitorReport> {
  const orphanMediaAssets = await pruneOrphanMediaAssets({ dryRun });
  const staleGeneratingMaps = await sweepStaleGeneratingMaps({ dryRun });
  return { orphanMediaAssets, staleGeneratingMaps };
}
