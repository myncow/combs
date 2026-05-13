DROP INDEX IF EXISTS "maps_published_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "maps_topic_family_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "maps_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "maps_is_public_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "media_assets_byte_hash_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pages_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "spotlights_score_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "spotlights_published_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "spotlights_topic_family_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_generation_runs_map_created_idx" ON "map_generation_runs" USING btree ("map_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spotlights_map_id_idx" ON "spotlights" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spotlights_score_published_idx" ON "spotlights" USING btree ("score" DESC NULLS LAST,"published_at" DESC NULLS LAST);
