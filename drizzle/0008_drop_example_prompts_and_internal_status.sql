DROP TABLE "example_prompts" CASCADE;--> statement-breakpoint
ALTER TABLE "maps" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."map_status";--> statement-breakpoint
CREATE TYPE "public"."map_status" AS ENUM('published', 'failed', 'generating');--> statement-breakpoint
ALTER TABLE "maps" ALTER COLUMN "status" SET DATA TYPE "public"."map_status" USING "status"::"public"."map_status";