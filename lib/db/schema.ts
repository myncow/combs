import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const mapStatusEnum = pgEnum("map_status", ["published", "failed", "generating"]);
export const mapCellStatusEnum = pgEnum("map_cell_status", ["existing", "rare", "gap", "tension", "impossible"]);
export const pageStatusEnum = pgEnum("page_status", ["draft", "published", "archived"]);
export const pageTemplateEnum = pgEnum("page_template", ["home", "listing"]);
export const navigationLocationEnum = pgEnum("navigation_location", [
  "header_primary",
  "footer_primary",
  "footer_legal",
]);
export const constraintKindEnum = pgEnum("constraint_kind", [
  "physical",
  "cultural",
  "economic",
  "taste",
  "taxonomy",
]);
export const calloutKindEnum = pgEnum("callout_kind", ["notable_gap", "impossible_combo"]);
export const assetProviderEnum = pgEnum("asset_provider", ["public_path", "external_url", "vercel_blob"]);
export const spotlightVoteDirectionEnum = pgEnum("spotlight_vote_direction", ["up", "down"]);

export const mapsTable = pgTable(
  "maps",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    domain: varchar("domain", { length: 120 }).notNull(),
    topicFamily: varchar("topic_family", { length: 80 }).notNull(),
    status: mapStatusEnum("status").notNull(),
    summary: text("summary").notNull(),
    promptSummary: text("prompt_summary").notNull(),
    intro: text("intro").default("").notNull(),
    seoTitle: varchar("seo_title", { length: 180 }).default("").notNull(),
    seoDescription: text("seo_description").default("").notNull(),
    renderingHints: jsonb("rendering_hints"),
    visualSeries: jsonb("visual_series"),
    revision: integer("revision").default(0).notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    createdByNeonUserId: varchar("created_by_neon_user_id", { length: 160 }),
    updatedByNeonUserId: varchar("updated_by_neon_user_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /**
     * Public URL of the most recent generated poster image for this map.
     * Persisted so the export dialog can show the existing artwork on
     * subsequent visits without re-running the (expensive) image model.
     * `null` until the owner first triggers a poster generation.
     */
    posterUrl: text("poster_url"),
    posterGeneratedAt: timestamp("poster_generated_at", { withTimezone: true }),
    /**
     * Client-supplied per-submit idempotency token. When the same owner
     * submits the same key twice (e.g. a retried POST /api/generate/start),
     * `reserveMap` returns the existing row instead of starting a new run.
     */
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
  },
  (table) => [
    index("maps_created_by_idx").on(table.createdByNeonUserId),
    uniqueIndex("maps_owner_idempotency_idx")
      .on(table.createdByNeonUserId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

export const mediaAssetsTable = pgTable(
  "media_assets",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: assetProviderEnum("provider").notNull(),
    storageKey: text("storage_key"),
    publicUrl: text("public_url").notNull(),
    mimeType: varchar("mime_type", { length: 160 }),
    byteSize: integer("byte_size"),
    width: integer("width"),
    height: integer("height"),
    byteHash: varchar("byte_hash", { length: 64 }),
    altText: text("alt_text"),
    createdByNeonUserId: varchar("created_by_neon_user_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("media_assets_public_url_idx").on(table.publicUrl)],
);

export const mapAxesTable = pgTable(
  "map_axes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("map_id", { length: 64 })
      .notNull()
      .references(() => mapsTable.id, { onDelete: "cascade" }),
    axisKey: varchar("axis_key", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    description: text("description").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("map_axes_map_axis_key_idx").on(table.mapId, table.axisKey),
    uniqueIndex("map_axes_map_position_idx").on(table.mapId, table.position),
  ],
);

export const mapAxisValuesTable = pgTable(
  "map_axis_values",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    axisId: varchar("axis_id", { length: 64 })
      .notNull()
      .references(() => mapAxesTable.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("map_axis_values_axis_position_idx").on(table.axisId, table.position),
  ],
);

export const mapCellsTable = pgTable(
  "map_cells",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("map_id", { length: 64 })
      .notNull()
      .references(() => mapsTable.id, { onDelete: "cascade" }),
    cellKey: varchar("cell_key", { length: 160 }).notNull(),
    label: varchar("label", { length: 180 }).notNull(),
    status: mapCellStatusEnum("status").notNull(),
    explanation: text("explanation").notNull(),
    confidence: integer("confidence_basis_points").notNull(),
    sortOrder: integer("sort_order").notNull(),
    visualizationAssetId: varchar("visualization_asset_id", { length: 64 }).references(() => mediaAssetsTable.id, {
      onDelete: "set null",
    }),
    visualizationCaption: text("visualization_caption"),
    visualizationImageModel: varchar("visualization_image_model", { length: 160 }),
    visualizationPrompt: text("visualization_prompt"),
    visualizationByteHash: varchar("visualization_byte_hash", { length: 64 }),
  },
  (table) => [
    uniqueIndex("map_cells_map_cell_key_idx").on(table.mapId, table.cellKey),
    uniqueIndex("map_cells_map_sort_order_idx").on(table.mapId, table.sortOrder),
    index("map_cells_map_status_idx").on(table.mapId, table.status),
  ],
);

export const mapCellCoordinatesTable = pgTable(
  "map_cell_coordinates",
  {
    cellId: varchar("cell_id", { length: 64 })
      .notNull()
      .references(() => mapCellsTable.id, { onDelete: "cascade" }),
    axisId: varchar("axis_id", { length: 64 })
      .notNull()
      .references(() => mapAxesTable.id, { onDelete: "cascade" }),
    axisValueId: varchar("axis_value_id", { length: 64 })
      .notNull()
      .references(() => mapAxisValuesTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.cellId, table.axisId] }),
    uniqueIndex("map_cell_coordinates_cell_value_idx").on(table.cellId, table.axisValueId),
  ],
);

export const mapCellBadgesTable = pgTable(
  "map_cell_badges",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    cellId: varchar("cell_id", { length: 64 })
      .notNull()
      .references(() => mapCellsTable.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [uniqueIndex("map_cell_badges_cell_sort_order_idx").on(table.cellId, table.sortOrder)],
);

export const mapExamplesTable = pgTable(
  "map_examples",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("map_id", { length: 64 })
      .notNull()
      .references(() => mapsTable.id, { onDelete: "cascade" }),
    cellId: varchar("cell_id", { length: 64 }).references(() => mapCellsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description").notNull(),
    status: mapCellStatusEnum("status").notNull(),
    coordinatesSnapshot: jsonb("coordinates_snapshot").notNull(),
    brand: varchar("brand", { length: 180 }),
    year: varchar("year", { length: 32 }),
    evidenceNote: text("evidence_note"),
    confidence: integer("confidence_basis_points"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("map_examples_cell_sort_order_idx").on(table.cellId, table.sortOrder),
    index("map_examples_map_idx").on(table.mapId),
  ],
);

export const mapExampleReferenceImagesTable = pgTable(
  "map_example_reference_images",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    exampleId: varchar("example_id", { length: 64 })
      .notNull()
      .references(() => mapExamplesTable.id, { onDelete: "cascade" }),
    link: text("link").notNull(),
    thumbnail: text("thumbnail"),
    title: text("title"),
    source: text("source"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [uniqueIndex("map_example_reference_images_example_sort_idx").on(table.exampleId, table.sortOrder)],
);

export const mapFeaturedExamplesTable = pgTable(
  "map_featured_examples",
  {
    mapId: varchar("map_id", { length: 64 })
      .notNull()
      .references(() => mapsTable.id, { onDelete: "cascade" }),
    exampleId: varchar("example_id", { length: 64 })
      .notNull()
      .references(() => mapExamplesTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.mapId, table.exampleId] }),
    uniqueIndex("map_featured_examples_map_sort_idx").on(table.mapId, table.sortOrder),
  ],
);

export const mapConstraintsTable = pgTable(
  "map_constraints",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("map_id", { length: 64 })
      .notNull()
      .references(() => mapsTable.id, { onDelete: "cascade" }),
    kind: constraintKindEnum("kind").notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    explanation: text("explanation").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [uniqueIndex("map_constraints_map_sort_idx").on(table.mapId, table.sortOrder)],
);

export const mapCalloutsTable = pgTable(
  "map_callouts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("map_id", { length: 64 })
      .notNull()
      .references(() => mapsTable.id, { onDelete: "cascade" }),
    cellId: varchar("cell_id", { length: 64 }).references(() => mapCellsTable.id, { onDelete: "set null" }),
    kind: calloutKindEnum("kind").notNull(),
    label: varchar("label", { length: 180 }).notNull(),
    explanation: text("explanation").notNull(),
    coordinatesSnapshot: jsonb("coordinates_snapshot").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [uniqueIndex("map_callouts_map_kind_sort_idx").on(table.mapId, table.kind, table.sortOrder)],
);

export const mapGenerationRunsTable = pgTable(
  "map_generation_runs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("map_id", { length: 64 }).references(() => mapsTable.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    fallbackModel: varchar("fallback_model", { length: 120 }),
    normalizedBrief: jsonb("normalized_brief"),
    inputBrief: jsonb("input_brief").notNull(),
    error: text("error"),
    metrics: jsonb("metrics"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("map_generation_runs_map_created_idx").on(table.mapId, table.createdAt.desc()),
  ],
);

export const cellVisualizationRunsTable = pgTable(
  "cell_visualization_runs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    mapId: varchar("map_id", { length: 64 }).references(() => mapsTable.id, { onDelete: "set null" }),
    cellId: varchar("cell_id", { length: 64 }).references(() => mapCellsTable.id, { onDelete: "set null" }),
    imageModel: varchar("image_model", { length: 160 }).notNull(),
    imageGenerationCalls: integer("image_generation_calls").default(1).notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    wallTimeMsTotal: integer("wall_time_ms_total"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cell_viz_runs_map_idx").on(table.mapId),
    index("cell_viz_runs_cell_idx").on(table.cellId),
  ],
);

export const spotlightsTable = pgTable(
  "spotlights",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    mapId: varchar("map_id", { length: 64 })
      .notNull()
      .references(() => mapsTable.id, { onDelete: "cascade" }),
    cellId: varchar("cell_id", { length: 64 })
      .notNull()
      .references(() => mapCellsTable.id, { onDelete: "cascade" }),
    mapSlugSnapshot: varchar("map_slug_snapshot", { length: 128 }).notNull(),
    mapTitleSnapshot: varchar("map_title_snapshot", { length: 180 }).notNull(),
    topicFamilySnapshot: varchar("topic_family_snapshot", { length: 80 }).notNull(),
    cellLabelSnapshot: varchar("cell_label_snapshot", { length: 180 }).notNull(),
    coordinatesSnapshot: jsonb("coordinates_snapshot").notNull(),
    imageAssetId: varchar("image_asset_id", { length: 64 }).references(() => mediaAssetsTable.id, {
      onDelete: "set null",
    }),
    storyTitle: varchar("story_title", { length: 120 }).notNull(),
    storySummary: varchar("story_summary", { length: 220 }).notNull(),
    score: integer("score").default(0).notNull(),
    upvotes: integer("upvotes").default(0).notNull(),
    downvotes: integer("downvotes").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("spotlights_map_id_idx").on(table.mapId),
    index("spotlights_score_published_idx").on(table.score.desc(), table.publishedAt.desc()),
    uniqueIndex("spotlights_map_cell_idx").on(table.mapId, table.cellId),
  ],
);

export const spotlightVotesTable = pgTable(
  "spotlight_votes",
  {
    spotlightId: varchar("spotlight_id", { length: 64 })
      .notNull()
      .references(() => spotlightsTable.id, { onDelete: "cascade" }),
    requesterId: varchar("requester_id", { length: 160 }).notNull(),
    direction: spotlightVoteDirectionEnum("direction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spotlightId, table.requesterId] }),
    index("spotlight_votes_spotlight_idx").on(table.spotlightId),
  ],
);

export const spotlightCommentsTable = pgTable(
  "spotlight_comments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    spotlightId: varchar("spotlight_id", { length: 64 })
      .notNull()
      .references(() => spotlightsTable.id, { onDelete: "cascade" }),
    authorNeonUserId: varchar("author_neon_user_id", { length: 160 }).notNull(),
    authorDisplayName: varchar("author_display_name", { length: 120 }),
    body: varchar("body", { length: 1200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("spotlight_comments_spotlight_created_idx").on(
      table.spotlightId,
      table.createdAt.desc(),
    ),
    index("spotlight_comments_author_idx").on(table.authorNeonUserId),
  ],
);

export const siteSettingsTable = pgTable("site_settings", {
  id: varchar("id", { length: 32 }).primaryKey(),
  appName: varchar("app_name", { length: 120 }).notNull(),
  defaultSeoTitle: varchar("default_seo_title", { length: 180 }).notNull(),
  defaultSeoDescription: text("default_seo_description").notNull(),
  metadataTitleTemplate: varchar("metadata_title_template", { length: 120 }).notNull(),
  openGraphTitle: varchar("open_graph_title", { length: 180 }).notNull(),
  openGraphDescription: text("open_graph_description").notNull(),
  footerCopy: text("footer_copy").notNull(),
  supportEmail: varchar("support_email", { length: 180 }),
  contactUrl: text("contact_url"),
  updatedByNeonUserId: varchar("updated_by_neon_user_id", { length: 160 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const navigationLinksTable = pgTable(
  "navigation_links",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    location: navigationLocationEnum("location").notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    href: text("href").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
  },
  (table) => [uniqueIndex("navigation_links_location_sort_idx").on(table.location, table.sortOrder)],
);

export const pagesTable = pgTable(
  "pages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    key: varchar("key", { length: 64 }).notNull().unique(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    template: pageTemplateEnum("template").notNull(),
    status: pageStatusEnum("status").notNull(),
    currentDraftRevisionId: varchar("current_draft_revision_id", { length: 64 }),
    currentPublishedRevisionId: varchar("current_published_revision_id", { length: 64 }),
    createdByNeonUserId: varchar("created_by_neon_user_id", { length: 160 }),
    updatedByNeonUserId: varchar("updated_by_neon_user_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
);

export const pageRevisionsTable = pgTable(
  "page_revisions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    pageId: varchar("page_id", { length: 64 })
      .notNull()
      .references(() => pagesTable.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    seoTitle: varchar("seo_title", { length: 180 }).notNull(),
    seoDescription: text("seo_description").notNull(),
    createdByNeonUserId: varchar("created_by_neon_user_id", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("page_revisions_page_revision_idx").on(table.pageId, table.revision)],
);

export const homePageRevisionsTable = pgTable("home_page_revisions", {
  pageRevisionId: varchar("page_revision_id", { length: 64 })
    .primaryKey()
    .references(() => pageRevisionsTable.id, { onDelete: "cascade" }),
  heroTitle: varchar("hero_title", { length: 180 }).notNull(),
  heroBody: text("hero_body").notNull(),
  primaryCtaLabel: varchar("primary_cta_label", { length: 80 }).notNull(),
  primaryCtaHref: text("primary_cta_href").notNull(),
  sectionEyebrow: varchar("section_eyebrow", { length: 80 }).notNull(),
  sectionTitle: varchar("section_title", { length: 180 }).notNull(),
  sectionSummary: text("section_summary").notNull(),
});

export const listingPageRevisionsTable = pgTable("listing_page_revisions", {
  pageRevisionId: varchar("page_revision_id", { length: 64 })
    .primaryKey()
    .references(() => pageRevisionsTable.id, { onDelete: "cascade" }),
  heading: varchar("heading", { length: 180 }).notNull(),
  intro: text("intro").notNull(),
  helperText: text("helper_text").notNull(),
  emptyStateTitle: varchar("empty_state_title", { length: 120 }).notNull(),
  emptyStateBody: text("empty_state_body").notNull(),
});

/**
 * Atomic per-window counter. Keyed by `(identifier, window_start_ms)` where
 * window_start_ms = floor(Date.now() / windowMs) * windowMs. INSERT … ON
 * CONFLICT … DO UPDATE returns the post-increment count in a single round-trip.
 * Old rows are dropped by the janitor or by a TTL job; rows do not need to
 * live longer than the largest configured window.
 */
export const rateLimitBucketsTable = pgTable(
  "rate_limit_buckets",
  {
    identifier: varchar("identifier", { length: 160 }).notNull(),
    windowStartMs: bigint("window_start_ms", { mode: "number" }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.windowStartMs] }),
    index("rate_limit_buckets_gc_idx").on(table.windowStartMs),
  ],
);
