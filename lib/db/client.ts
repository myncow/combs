import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { getDatabaseUrl } from "@/lib/env";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlClient: ReturnType<typeof postgres> | null = null;

export function getDb() {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Set DATABASE_URL or DATABASE_URL_UNPOOLED to a Postgres connection string (see .env.example).",
    );
  }

  if (!dbInstance) {
    sqlClient = postgres(url, {
      prepare: false,
    });
    dbInstance = drizzle(sqlClient, { schema });
  }

  return dbInstance;
}

/** Clears the singleton and closes the connection. For tests when switching URLs or isolating workers. */
export async function resetDbClientForTests(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
  }
  dbInstance = null;
}
