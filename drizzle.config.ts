import { config } from "dotenv";
import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    "DATABASE_URL is required for Drizzle CLI (migrate, generate, studio). Set it in the environment or .env.local — see .env.example.",
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
} satisfies Config;
