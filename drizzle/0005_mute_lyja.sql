CREATE TYPE "public"."asset_provider" AS ENUM('public_path', 'external_url', 'vercel_blob');--> statement-breakpoint
CREATE TYPE "public"."callout_kind" AS ENUM('notable_gap', 'impossible_combo');--> statement-breakpoint
CREATE TYPE "public"."constraint_kind" AS ENUM('physical', 'cultural', 'economic', 'taste', 'taxonomy');--> statement-breakpoint
CREATE TYPE "public"."map_cell_status" AS ENUM('existing', 'rare', 'gap', 'tension', 'impossible');--> statement-breakpoint
CREATE TYPE "public"."map_status" AS ENUM('published', 'internal', 'failed', 'generating');--> statement-breakpoint
CREATE TYPE "public"."navigation_location" AS ENUM('header_primary', 'footer_primary', 'footer_legal');--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."page_template" AS ENUM('home', 'listing');--> statement-breakpoint
CREATE TYPE "public"."spotlight_vote_direction" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TABLE "map_generation_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64),
	"status" varchar(20) NOT NULL,
	"model" varchar(120) NOT NULL,
	"fallback_model" varchar(120),
	"normalized_brief" jsonb,
	"input_brief" jsonb NOT NULL,
	"error" text,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_page_revisions" (
	"page_revision_id" varchar(64) PRIMARY KEY NOT NULL,
	"hero_title" varchar(180) NOT NULL,
	"hero_body" text NOT NULL,
	"primary_cta_label" varchar(80) NOT NULL,
	"primary_cta_href" text NOT NULL,
	"section_eyebrow" varchar(80) NOT NULL,
	"section_title" varchar(180) NOT NULL,
	"section_summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_page_revisions" (
	"page_revision_id" varchar(64) PRIMARY KEY NOT NULL,
	"heading" varchar(180) NOT NULL,
	"intro" text NOT NULL,
	"helper_text" text NOT NULL,
	"empty_state_title" varchar(120) NOT NULL,
	"empty_state_body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_axes" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64) NOT NULL,
	"axis_key" varchar(64) NOT NULL,
	"label" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_axis_values" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"axis_id" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_callouts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64) NOT NULL,
	"cell_id" varchar(64),
	"kind" "callout_kind" NOT NULL,
	"label" varchar(180) NOT NULL,
	"explanation" text NOT NULL,
	"coordinates_snapshot" jsonb NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_cell_badges" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"cell_id" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_cell_coordinates" (
	"cell_id" varchar(64) NOT NULL,
	"axis_id" varchar(64) NOT NULL,
	"axis_value_id" varchar(64) NOT NULL,
	CONSTRAINT "map_cell_coordinates_cell_id_axis_id_pk" PRIMARY KEY("cell_id","axis_id")
);
--> statement-breakpoint
CREATE TABLE "map_cells" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64) NOT NULL,
	"cell_key" varchar(160) NOT NULL,
	"label" varchar(180) NOT NULL,
	"status" "map_cell_status" NOT NULL,
	"explanation" text NOT NULL,
	"confidence_basis_points" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"visualization_asset_id" varchar(64),
	"visualization_caption" text,
	"visualization_image_model" varchar(160),
	"visualization_prompt" text,
	"visualization_byte_hash" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "map_constraints" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64) NOT NULL,
	"kind" "constraint_kind" NOT NULL,
	"label" varchar(160) NOT NULL,
	"explanation" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_example_reference_images" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"example_id" varchar(64) NOT NULL,
	"link" text NOT NULL,
	"thumbnail" text,
	"title" text,
	"source" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_examples" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64) NOT NULL,
	"cell_id" varchar(64),
	"name" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"status" "map_cell_status" NOT NULL,
	"coordinates_snapshot" jsonb NOT NULL,
	"brand" varchar(180),
	"year" varchar(32),
	"evidence_note" text,
	"confidence_basis_points" integer,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "map_featured_examples" (
	"map_id" varchar(64) NOT NULL,
	"example_id" varchar(64) NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "map_featured_examples_map_id_example_id_pk" PRIMARY KEY("map_id","example_id")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider" "asset_provider" NOT NULL,
	"storage_key" text,
	"public_url" text NOT NULL,
	"mime_type" varchar(160),
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"byte_hash" varchar(64),
	"alt_text" text,
	"created_by_neon_user_id" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "navigation_links" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"location" "navigation_location" NOT NULL,
	"label" varchar(80) NOT NULL,
	"href" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"page_id" varchar(64) NOT NULL,
	"revision" integer NOT NULL,
	"title" varchar(180) NOT NULL,
	"seo_title" varchar(180) NOT NULL,
	"seo_description" text NOT NULL,
	"created_by_neon_user_id" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"template" "page_template" NOT NULL,
	"status" "page_status" NOT NULL,
	"current_draft_revision_id" varchar(64),
	"current_published_revision_id" varchar(64),
	"created_by_neon_user_id" varchar(160),
	"updated_by_neon_user_id" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "pages_key_unique" UNIQUE("key"),
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"app_name" varchar(120) NOT NULL,
	"default_seo_title" varchar(180) NOT NULL,
	"default_seo_description" text NOT NULL,
	"metadata_title_template" varchar(120) NOT NULL,
	"open_graph_title" varchar(180) NOT NULL,
	"open_graph_description" text NOT NULL,
	"footer_copy" text NOT NULL,
	"support_email" varchar(180),
	"contact_url" text,
	"updated_by_neon_user_id" varchar(160),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spotlight_votes" (
	"spotlight_id" varchar(64) NOT NULL,
	"requester_id" varchar(160) NOT NULL,
	"direction" "spotlight_vote_direction" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotlight_votes_spotlight_id_requester_id_pk" PRIMARY KEY("spotlight_id","requester_id")
);
--> statement-breakpoint
CREATE TABLE "spotlights" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"slug" varchar(180) NOT NULL,
	"map_id" varchar(64) NOT NULL,
	"cell_id" varchar(64) NOT NULL,
	"map_slug_snapshot" varchar(128) NOT NULL,
	"map_title_snapshot" varchar(180) NOT NULL,
	"topic_family_snapshot" varchar(80) NOT NULL,
	"cell_label_snapshot" varchar(180) NOT NULL,
	"coordinates_snapshot" jsonb NOT NULL,
	"image_asset_id" varchar(64),
	"story_title" varchar(120) NOT NULL,
	"story_summary" varchar(220) NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spotlights_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "maps" ALTER COLUMN "status" SET DATA TYPE "public"."map_status" USING "status"::"public"."map_status";--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "intro" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "seo_title" varchar(180) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "seo_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "rendering_hints" jsonb;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "visual_series" jsonb;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "created_by_neon_user_id" varchar(160);--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "updated_by_neon_user_id" varchar(160);--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "map_generation_runs" ADD CONSTRAINT "map_generation_runs_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_page_revisions" ADD CONSTRAINT "home_page_revisions_page_revision_id_page_revisions_id_fk" FOREIGN KEY ("page_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_page_revisions" ADD CONSTRAINT "listing_page_revisions_page_revision_id_page_revisions_id_fk" FOREIGN KEY ("page_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_axes" ADD CONSTRAINT "map_axes_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_axis_values" ADD CONSTRAINT "map_axis_values_axis_id_map_axes_id_fk" FOREIGN KEY ("axis_id") REFERENCES "public"."map_axes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_callouts" ADD CONSTRAINT "map_callouts_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_callouts" ADD CONSTRAINT "map_callouts_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_badges" ADD CONSTRAINT "map_cell_badges_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_coordinates" ADD CONSTRAINT "map_cell_coordinates_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_coordinates" ADD CONSTRAINT "map_cell_coordinates_axis_id_map_axes_id_fk" FOREIGN KEY ("axis_id") REFERENCES "public"."map_axes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cell_coordinates" ADD CONSTRAINT "map_cell_coordinates_axis_value_id_map_axis_values_id_fk" FOREIGN KEY ("axis_value_id") REFERENCES "public"."map_axis_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cells" ADD CONSTRAINT "map_cells_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cells" ADD CONSTRAINT "map_cells_visualization_asset_id_media_assets_id_fk" FOREIGN KEY ("visualization_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_constraints" ADD CONSTRAINT "map_constraints_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_example_reference_images" ADD CONSTRAINT "map_example_reference_images_example_id_map_examples_id_fk" FOREIGN KEY ("example_id") REFERENCES "public"."map_examples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_examples" ADD CONSTRAINT "map_examples_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_examples" ADD CONSTRAINT "map_examples_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_featured_examples" ADD CONSTRAINT "map_featured_examples_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_featured_examples" ADD CONSTRAINT "map_featured_examples_example_id_map_examples_id_fk" FOREIGN KEY ("example_id") REFERENCES "public"."map_examples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlight_votes" ADD CONSTRAINT "spotlight_votes_spotlight_id_spotlights_id_fk" FOREIGN KEY ("spotlight_id") REFERENCES "public"."spotlights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlights" ADD CONSTRAINT "spotlights_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlights" ADD CONSTRAINT "spotlights_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spotlights" ADD CONSTRAINT "spotlights_image_asset_id_media_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "map_axes_map_axis_key_idx" ON "map_axes" USING btree ("map_id","axis_key");--> statement-breakpoint
CREATE UNIQUE INDEX "map_axes_map_position_idx" ON "map_axes" USING btree ("map_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "map_axis_values_axis_position_idx" ON "map_axis_values" USING btree ("axis_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "map_callouts_map_kind_sort_idx" ON "map_callouts" USING btree ("map_id","kind","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "map_cell_badges_cell_sort_order_idx" ON "map_cell_badges" USING btree ("cell_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "map_cell_coordinates_cell_value_idx" ON "map_cell_coordinates" USING btree ("cell_id","axis_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "map_cells_map_cell_key_idx" ON "map_cells" USING btree ("map_id","cell_key");--> statement-breakpoint
CREATE UNIQUE INDEX "map_cells_map_sort_order_idx" ON "map_cells" USING btree ("map_id","sort_order");--> statement-breakpoint
CREATE INDEX "map_cells_map_status_idx" ON "map_cells" USING btree ("map_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "map_constraints_map_sort_idx" ON "map_constraints" USING btree ("map_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "map_example_reference_images_example_sort_idx" ON "map_example_reference_images" USING btree ("example_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "map_examples_cell_sort_order_idx" ON "map_examples" USING btree ("cell_id","sort_order");--> statement-breakpoint
CREATE INDEX "map_examples_map_idx" ON "map_examples" USING btree ("map_id");--> statement-breakpoint
CREATE UNIQUE INDEX "map_featured_examples_map_sort_idx" ON "map_featured_examples" USING btree ("map_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_public_url_idx" ON "media_assets" USING btree ("public_url");--> statement-breakpoint
CREATE INDEX "media_assets_byte_hash_idx" ON "media_assets" USING btree ("byte_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_links_location_sort_idx" ON "navigation_links" USING btree ("location","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revisions_page_revision_idx" ON "page_revisions" USING btree ("page_id","revision");--> statement-breakpoint
CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "spotlight_votes_spotlight_idx" ON "spotlight_votes" USING btree ("spotlight_id");--> statement-breakpoint
CREATE INDEX "spotlights_score_idx" ON "spotlights" USING btree ("score");--> statement-breakpoint
CREATE INDEX "spotlights_published_idx" ON "spotlights" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "spotlights_topic_family_idx" ON "spotlights" USING btree ("topic_family_snapshot");--> statement-breakpoint
CREATE UNIQUE INDEX "spotlights_map_cell_idx" ON "spotlights" USING btree ("map_id","cell_id");