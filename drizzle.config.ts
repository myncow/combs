import { config } from "dotenv";
import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), `.env.${process.env.NODE_ENV ?? "development"}.local`) });

const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL_UNPOOLED?.trim();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for Drizzle CLI (migrate, generate, studio). Set DATABASE_URL or DATABASE_URL_UNPOOLED in the environment or .env.local — see .env.example.",
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
