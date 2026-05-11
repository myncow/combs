ALTER TABLE "maps" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maps_created_by_idx" ON "maps" USING btree ("created_by_neon_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "maps_is_public_idx" ON "maps" USING btree ("is_public");
