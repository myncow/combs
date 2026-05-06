CREATE TABLE "example_prompts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"title" varchar(120) NOT NULL,
	"topic_family" varchar(80) NOT NULL,
	"prompt" text NOT NULL,
	"why_it_works" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64),
	"status" varchar(20) NOT NULL,
	"model" varchar(120) NOT NULL,
	"fallback_model" varchar(120),
	"normalized_brief" jsonb,
	"input_brief" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"slug" varchar(128) NOT NULL,
	"title" varchar(180) NOT NULL,
	"domain" varchar(120) NOT NULL,
	"topic_family" varchar(80) NOT NULL,
	"status" varchar(20) NOT NULL,
	"quality_score" numeric(5, 2) NOT NULL,
	"summary" text NOT NULL,
	"prompt_summary" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "maps_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "maps_published_idx" ON "maps" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "maps_topic_family_idx" ON "maps" USING btree ("topic_family");--> statement-breakpoint
CREATE INDEX "maps_status_idx" ON "maps" USING btree ("status");