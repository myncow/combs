CREATE TABLE "leaderboard_entries" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"slug" varchar(180) NOT NULL,
	"map_id" varchar(64) NOT NULL,
	"map_slug" varchar(128) NOT NULL,
	"map_title" varchar(180) NOT NULL,
	"topic_family" varchar(80) NOT NULL,
	"cell_id" varchar(160) NOT NULL,
	"cell_label" varchar(180) NOT NULL,
	"coordinates_snapshot" jsonb NOT NULL,
	"image_url" text NOT NULL,
	"story_title" varchar(120) NOT NULL,
	"story_summary" varchar(220) NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_entries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_votes" (
	"entry_id" varchar(64) NOT NULL,
	"requester_id" varchar(160) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "leaderboard_entries_score_idx" ON "leaderboard_entries" USING btree ("score");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_published_idx" ON "leaderboard_entries" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_topic_family_idx" ON "leaderboard_entries" USING btree ("topic_family");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_entries_map_cell_idx" ON "leaderboard_entries" USING btree ("map_slug","cell_id");--> statement-breakpoint
CREATE INDEX "leaderboard_votes_entry_idx" ON "leaderboard_votes" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_votes_entry_requester_idx" ON "leaderboard_votes" USING btree ("entry_id","requester_id");