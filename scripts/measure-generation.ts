/**
 * Generation pipeline timing audit.
 *
 * Reads the last N successful runs from `map_generation_runs`, parses their
 * persisted `metrics` JSON, and reports where wall time actually goes per stage.
 *
 * Also runs three "what if" projections that estimate the wall-time saving of:
 *   (A) Moving SerpApi stages (anchor, gap, reference) off the publish path.
 *   (B) Bumping cells-batch concurrency 2 → 4.
 *   (C) Dropping the skeleton visual-probe retry.
 *
 * Run: pnpm tsx scripts/measure-generation.ts [--limit N] [--json]
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { desc, eq } from "drizzle-orm";
import { getDb, resetDbClientForTests } from "@/lib/db/client";
import { mapGenerationRunsTable } from "@/lib/db/schema";
import type { GenerationMetrics, GenerationStageMetric } from "@/lib/generation-metrics";

type RunRow = {
  id: string;
  mapId: string | null;
  status: string;
  model: string;
  metrics: unknown;
  createdAt: Date;
};

type StageSample = {
  runId: string;
  durationMs: number;
  externalCallCount?: number;
  retryCount?: number;
  extras?: Record<string, unknown>;
};

type StageAgg = {
  stageId: string;
  count: number;
  p50: number;
  p90: number;
  mean: number;
  totalMs: number;
  externalCallsP50: number;
};

const args = process.argv.slice(2);
const limit = Number(takeFlag(args, "--limit") ?? 40);
const jsonOnly = args.includes("--json");

function takeFlag(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  return argv[i + 1];
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function aggregateStage(stageId: string, samples: StageSample[]): StageAgg {
  const sorted = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const calls = samples.map((s) => s.externalCallCount ?? 0).sort((a, b) => a - b);
  return {
    stageId,
    count: samples.length,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    mean: Math.round(mean(sorted)),
    totalMs: sorted.reduce((a, b) => a + b, 0),
    externalCallsP50: percentile(calls, 0.5),
  };
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function isGenerationMetrics(v: unknown): v is GenerationMetrics {
  return (
    typeof v === "object" &&
    v !== null &&
    "stages" in v &&
    Array.isArray((v as { stages: unknown }).stages)
  );
}

async function main() {
  const db = getDb();
  const rows = (await db
    .select()
    .from(mapGenerationRunsTable)
    .where(eq(mapGenerationRunsTable.status, "success"))
    .orderBy(desc(mapGenerationRunsTable.createdAt))
    .limit(limit)) as RunRow[];

  if (!rows.length) {
    console.error("No successful generation runs found. Have any generated maps published yet?");
    process.exit(1);
  }

  const stageSamples = new Map<string, StageSample[]>();
  const wallTotals: number[] = [];
  const runSummaries: Array<{
    id: string;
    createdAt: string;
    wallMs: number;
    fallbackUsed: boolean;
    skeletonRetried: boolean;
    cellParseRetries: number;
  }> = [];

  for (const row of rows) {
    if (!isGenerationMetrics(row.metrics)) continue;
    const m = row.metrics;
    if (typeof m.wallTimeMsTotal === "number") wallTotals.push(m.wallTimeMsTotal);

    let fallbackUsed = false;
    let skeletonRetried = false;
    let cellParseRetries = 0;

    for (const stage of m.stages) {
      const samples = stageSamples.get(stage.stageId) ?? [];
      samples.push({
        runId: row.id,
        durationMs: stage.durationMs,
        externalCallCount: stage.externalCallCount,
        retryCount: stage.retryCount,
        extras: stage.extras,
      });
      stageSamples.set(stage.stageId, samples);
      if (stage.fallbackUsed) fallbackUsed = true;
      if (stage.stageId === "skeleton_visual_probe_retry") skeletonRetried = true;
      if (stage.stageId === "cells_batches" && typeof stage.retryCount === "number") {
        cellParseRetries += stage.retryCount;
      }
    }

    runSummaries.push({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      wallMs: m.wallTimeMsTotal ?? 0,
      fallbackUsed,
      skeletonRetried,
      cellParseRetries,
    });
  }

  const aggregated: StageAgg[] = [];
  for (const [stageId, samples] of stageSamples) {
    aggregated.push(aggregateStage(stageId, samples));
  }

  aggregated.sort((a, b) => b.p50 - a.p50);

  const sortedWall = [...wallTotals].sort((a, b) => a - b);
  const wallP50 = percentile(sortedWall, 0.5);
  const wallP90 = percentile(sortedWall, 0.9);

  // What-if projections (based on p50 stage timings only).
  const stageP50 = (id: string): number => aggregated.find((s) => s.stageId === id)?.p50 ?? 0;
  const cellsBatchesP50 = stageP50("cells_batches");
  const cellsBatchData = stageSamples
    .get("cells_batches")
    ?.flatMap((s) => {
      const batchCount =
        typeof s.extras?.batchCount === "number" ? (s.extras.batchCount as number) : 0;
      return batchCount > 0 ? [{ duration: s.durationMs, batches: batchCount }] : [];
    }) ?? [];
  const medianBatchCount =
    cellsBatchData.length > 0
      ? cellsBatchData
          .map((d) => d.batches)
          .sort((a, b) => a - b)[Math.floor(cellsBatchData.length / 2)]
      : 0;

  const anchorP50 = stageP50("anchor_verification");
  const gapP50 = stageP50("gap_verification");
  const refsP50 = stageP50("reference_images_enrichment");
  const postP50 = stageP50("post_process");
  const skelRetryP50 = stageP50("skeleton_visual_probe_retry");
  const skelRetryRate =
    stageSamples.get("skeleton_visual_probe_retry")?.length ?? 0
      ? (stageSamples.get("skeleton_visual_probe_retry")!.length / runSummaries.length)
      : 0;

  // Bump 2→4: with concurrency 2 and batch_count B, wall ≈ ceil(B/2)*batchTime.
  // With 4: wall ≈ ceil(B/4)*batchTime. Saving = current - new.
  let cellsConcurrencyProjection = 0;
  if (medianBatchCount > 0 && cellsBatchesP50 > 0) {
    const currentSlots = Math.ceil(medianBatchCount / 2);
    const newSlots = Math.ceil(medianBatchCount / 4);
    const batchTime = cellsBatchesP50 / currentSlots;
    cellsConcurrencyProjection = batchTime * (currentSlots - newSlots);
  }

  const offCritPathProjection = anchorP50 + gapP50 + refsP50;
  const skelRetryProjection = skelRetryP50 * skelRetryRate;

  const summary = {
    runsAnalyzed: runSummaries.length,
    wall: { p50: wallP50, p90: wallP90, samples: sortedWall.length },
    stages: aggregated,
    projections: {
      offCriticalPath_AnchorGapRefs: {
        p50SavingMs: Math.round(offCritPathProjection),
        rationale: `Sum of p50(anchor_verification)+p50(gap_verification)+p50(reference_images_enrichment) — they currently block publish but don't change the LLM-decided cell map.`,
      },
      cellsConcurrency2to4: {
        p50SavingMs: Math.round(cellsConcurrencyProjection),
        rationale: `Assuming median ${medianBatchCount} batches at concurrency 2 take ${Math.round(cellsBatchesP50)}ms wall, raising concurrency to 4 cuts slots from ${Math.ceil(medianBatchCount / 2)} → ${Math.ceil(medianBatchCount / 4)}.`,
      },
      skipSkeletonVisualProbeRetry: {
        p50SavingMs: Math.round(skelRetryProjection),
        rationale: `Skeleton visual-probe retry fires in ~${(skelRetryRate * 100).toFixed(0)}% of runs; saving = retry_p50 × fire_rate.`,
      },
    },
    qualitySignals: {
      fallbackRate: runSummaries.filter((r) => r.fallbackUsed).length / runSummaries.length,
      skeletonRetryRate: skelRetryRate,
      avgCellParseRetries: mean(runSummaries.map((r) => r.cellParseRetries)),
    },
  };

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(summary, null, 2));
    await resetDbClientForTests();
    return;
  }

  console.log(`\n## Generation pipeline timing — last ${runSummaries.length} successful runs\n`);
  console.log(`Wall time:   p50=${fmtMs(wallP50)}  p90=${fmtMs(wallP90)}  (n=${sortedWall.length})`);
  console.log(
    `Quality flags: fallback model used in ${(summary.qualitySignals.fallbackRate * 100).toFixed(1)}% of runs · skeleton retry in ${(skelRetryRate * 100).toFixed(1)}% · avg cell parse retries=${summary.qualitySignals.avgCellParseRetries.toFixed(2)}`,
  );
  console.log("");
  console.log("Per stage (sorted by p50):");
  console.log(
    "  stage_id                                  count   p50      p90      mean    share(p50)  ext_calls_p50",
  );
  for (const s of aggregated) {
    console.log(
      `  ${s.stageId.padEnd(40)}  ${String(s.count).padStart(5)}   ${fmtMs(s.p50).padEnd(7)}  ${fmtMs(s.p90).padEnd(7)}  ${fmtMs(s.mean).padEnd(6)}  ${pct(s.p50, wallP50).padEnd(9)}  ${s.externalCallsP50}`,
    );
  }

  console.log("\n## What-if projections (p50)\n");
  console.log(
    `  (A) Move anchor + gap + references OFF publish path:   −${fmtMs(offCritPathProjection)}  (${pct(offCritPathProjection, wallP50)} of wall p50)`,
  );
  console.log(
    `  (B) Cells concurrency 2 → 4 (median ${medianBatchCount} batches):   −${fmtMs(cellsConcurrencyProjection)}  (${pct(cellsConcurrencyProjection, wallP50)})`,
  );
  console.log(
    `  (C) Drop skeleton visual-probe retry (fires ${(skelRetryRate * 100).toFixed(0)}% of runs):   −${fmtMs(skelRetryProjection)}  (${pct(skelRetryProjection, wallP50)})`,
  );
  console.log(
    `  Combined (A+B+C) p50 projected wall: ${fmtMs(wallP50 - offCritPathProjection - cellsConcurrencyProjection - skelRetryProjection)}  (was ${fmtMs(wallP50)})`,
  );
  console.log("");

  const outDir = resolve(process.cwd(), ".generation-metrics");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `measurement-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ summary, runs: runSummaries }, null, 2));
  console.log(`Raw measurement written to: ${outPath}`);

  await resetDbClientForTests();
}

main().catch((err) => {
  console.error("Measurement failed:", err);
  process.exit(1);
});
