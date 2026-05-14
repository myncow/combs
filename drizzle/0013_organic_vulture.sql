CREATE TABLE "spotlight_comments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"spotlight_id" varchar(64) NOT NULL,
	"author_neon_user_id" varchar(160) NOT NULL,
	"author_display_name" varchar(120),
	"body" varchar(1200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spotlight_comments" ADD CONSTRAINT "spotlight_comments_spotlight_id_spotlights_id_fk" FOREIGN KEY ("spotlight_id") REFERENCES "public"."spotlights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spotlight_comments_spotlight_created_idx" ON "spotlight_comments" USING btree ("spotlight_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spotlight_comments_author_idx" ON "spotlight_comments" USING btree ("author_neon_user_id");