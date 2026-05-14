ALTER TABLE "maps" ADD COLUMN "idempotency_key" varchar(80);
--> statement-breakpoint
CREATE UNIQUE INDEX "maps_owner_idempotency_idx"
  ON "maps" ("created_by_neon_user_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
