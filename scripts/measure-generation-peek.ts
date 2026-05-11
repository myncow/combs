import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { desc } from "drizzle-orm";
import { getDb, resetDbClientForTests } from "@/lib/db/client";
import { mapGenerationRunsTable } from "@/lib/db/schema";

async function main() {
  const db = getDb();
  const rows = await db
    .select()
    .from(mapGenerationRunsTable)
    .orderBy(desc(mapGenerationRunsTable.createdAt))
    .limit(8);
  for (const r of rows) {
    console.log(`\n=== run ${r.id}  status=${r.status}  at=${r.createdAt.toISOString()} ===`);
    console.log(`  error: ${r.error ?? "(none)"}`);
    console.log(`  metrics:`);
    console.log(JSON.stringify(r.metrics, null, 2));
  }
  await resetDbClientForTests();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
