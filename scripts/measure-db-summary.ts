import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

loadEnv({ path: resolve(process.cwd(), ".env") });
const vercelEnv = resolve(process.cwd(), ".vercel/.env.production.local");
if (existsSync(vercelEnv)) loadEnv({ path: vercelEnv });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { desc, sql } from "drizzle-orm";
import { getDb, resetDbClientForTests } from "@/lib/db/client";
import { mapsTable, mapGenerationRunsTable } from "@/lib/db/schema";

async function main() {
  const db = getDb();

  const mapCounts = await db
    .select({ status: mapsTable.status, n: sql<number>`count(*)::int` })
    .from(mapsTable)
    .groupBy(mapsTable.status);
  console.log("maps by status:", mapCounts);

  const runCounts = await db
    .select({ status: mapGenerationRunsTable.status, n: sql<number>`count(*)::int` })
    .from(mapGenerationRunsTable)
    .groupBy(mapGenerationRunsTable.status);
  console.log("generation_runs by status:", runCounts);

  const recentMaps = await db
    .select({
      id: mapsTable.id,
      slug: mapsTable.slug,
      title: mapsTable.title,
      status: mapsTable.status,
      createdAt: mapsTable.createdAt,
      updatedAt: mapsTable.updatedAt,
    })
    .from(mapsTable)
    .orderBy(desc(mapsTable.updatedAt))
    .limit(8);
  console.log("\n8 most recently updated maps:");
  for (const m of recentMaps) {
    console.log(
      `  ${m.updatedAt.toISOString()}  status=${m.status.padEnd(11)}  ${m.slug.padEnd(40)}  ${m.title}`,
    );
  }

  await resetDbClientForTests();
}
main().catch((e) => { console.error(e); process.exit(1); });
