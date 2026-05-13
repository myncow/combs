CREATE TABLE "cell_visualization_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"map_id" varchar(64),
	"cell_id" varchar(64),
	"image_model" varchar(160) NOT NULL,
	"image_generation_calls" integer DEFAULT 1 NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"wall_time_ms_total" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cell_visualization_runs" ADD CONSTRAINT "cell_visualization_runs_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_visualization_runs" ADD CONSTRAINT "cell_visualization_runs_cell_id_map_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."map_cells"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cell_viz_runs_map_idx" ON "cell_visualization_runs" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "cell_viz_runs_cell_idx" ON "cell_visualization_runs" USING btree ("cell_id");