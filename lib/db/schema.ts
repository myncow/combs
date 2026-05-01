import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const mapsTable = pgTable(
  "maps",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    domain: varchar("domain", { length: 120 }).notNull(),
    topicFamily: varchar("topic_family", { length: 80 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    summary: text("summary").notNull(),
    promptSummary: text("prompt_summary").notNull(),
    document: jsonb("document").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("maps_published_idx").on(table.publishedAt),
    index("maps_topic_family_idx").on(table.topicFamily),
    index("maps_status_idx").on(table.status),
  ],
);

export const generationRunsTable = pgTable("generation_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  mapId: varchar("map_id", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull(),
  model: varchar("model", { length: 120 }).notNull(),
  fallbackModel: varchar("fallback_model", { length: 120 }),
  normalizedBrief: jsonb("normalized_brief"),
  inputBrief: jsonb("input_brief").notNull(),
  error: text("error"),
  metrics: jsonb("metrics"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const examplePromptsTable = pgTable("example_prompts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  topicFamily: varchar("topic_family", { length: 80 }).notNull(),
  prompt: text("prompt").notNull(),
  whyItWorks: text("why_it_works").notNull(),
});
