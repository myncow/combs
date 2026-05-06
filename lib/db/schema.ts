import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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
    revision: integer("revision").default(0).notNull(),
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

export const leaderboardEntriesTable = pgTable(
  "leaderboard_entries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    mapId: varchar("map_id", { length: 64 }).notNull(),
    mapSlug: varchar("map_slug", { length: 128 }).notNull(),
    mapTitle: varchar("map_title", { length: 180 }).notNull(),
    topicFamily: varchar("topic_family", { length: 80 }).notNull(),
    cellId: varchar("cell_id", { length: 160 }).notNull(),
    cellLabel: varchar("cell_label", { length: 180 }).notNull(),
    coordinatesSnapshot: jsonb("coordinates_snapshot").notNull(),
    imageUrl: text("image_url").notNull(),
    storyTitle: varchar("story_title", { length: 120 }).notNull(),
    storySummary: varchar("story_summary", { length: 220 }).notNull(),
    score: integer("score").default(0).notNull(),
    upvotes: integer("upvotes").default(0).notNull(),
    downvotes: integer("downvotes").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("leaderboard_entries_score_idx").on(table.score),
    index("leaderboard_entries_published_idx").on(table.publishedAt),
    index("leaderboard_entries_topic_family_idx").on(table.topicFamily),
    uniqueIndex("leaderboard_entries_map_cell_idx").on(table.mapSlug, table.cellId),
  ],
);

export const leaderboardVotesTable = pgTable(
  "leaderboard_votes",
  {
    entryId: varchar("entry_id", { length: 64 }).notNull(),
    requesterId: varchar("requester_id", { length: 160 }).notNull(),
    direction: varchar("direction", { length: 8 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("leaderboard_votes_entry_idx").on(table.entryId),
    uniqueIndex("leaderboard_votes_entry_requester_idx").on(table.entryId, table.requesterId),
  ],
);
