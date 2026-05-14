CREATE TABLE "rate_limit_buckets" (
	"identifier" varchar(160) NOT NULL,
	"window_start_ms" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_buckets_identifier_window_start_ms_pk" PRIMARY KEY("identifier","window_start_ms")
);
--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_gc_idx" ON "rate_limit_buckets" USING btree ("window_start_ms");
