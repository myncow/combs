import { config } from "dotenv";
import { resolve } from "node:path";
import { ensureEditorialContentSeeded } from "@/lib/store/content";
import { backfillRelationalContent } from "@/lib/store/maps";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), `.env.${process.env.NODE_ENV ?? "development"}.local`) });

async function main() {
  await ensureEditorialContentSeeded();
  await backfillRelationalContent();
  console.log("Relational content backfill complete.");
}

main().catch((error) => {
  console.error("Relational content backfill failed:", error);
  process.exitCode = 1;
});
