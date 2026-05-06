import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const raw = process.env.TEST_DATABASE_URL?.trim();
if (raw) {
  process.env.DATABASE_URL = raw;
}

/** False when no isolated Postgres URL is available. Never run destructive store tests on the dev DB. */
export const isLeaderboardStoreTestDbConfigured = Boolean(raw);
