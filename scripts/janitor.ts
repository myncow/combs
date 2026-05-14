import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

loadEnv({ path: resolve(process.cwd(), ".env") });
const vercelEnv = resolve(process.cwd(), ".vercel/.env.production.local");
if (existsSync(vercelEnv)) loadEnv({ path: vercelEnv });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

import { resetDbClientForTests } from "@/lib/db/client";
import { runJanitor } from "@/lib/janitor";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("[janitor] dry-run mode (no writes)");

  const report = await runJanitor({ dryRun });
  console.log(
    `[janitor] orphan media_assets: found=${report.orphanMediaAssets.found} deleted=${report.orphanMediaAssets.deleted}`,
  );
  console.log(
    `[janitor] stale 'generating' maps: found=${report.staleGeneratingMaps.found} failed=${report.staleGeneratingMaps.failed}`,
  );

  await resetDbClientForTests();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
