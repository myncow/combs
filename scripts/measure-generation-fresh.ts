/**
 * Fresh-generation timing measurement.
 *
 * Runs N audit fixtures end-to-end via buildMapJob() and aggregates per-stage
 * timings from the in-memory GenerationMetricsCollector. Does NOT persist
 * anything to the database (no mapId passed).
 *
 * Loads prod creds from .vercel/.env.production.local if present, so SerpApi
 * stages run too. Uses real OpenRouter — costs cents per run.
 *
 * Run: pnpm tsx scripts/measure-generation-fresh.ts [--fixtures id1,id2] [--iters N]
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });
const vercelEnv = resolve(process.cwd(), ".vercel/.env.production.local");
if (existsSync(vercelEnv)) {
  loadEnv({ path: vercelEnv, override: true });
}

import { GenerationMetricsCollector } from "@/lib/generation-metrics";
import { buildMapJob } from "@/lib/map-engine";
import type { MapBriefInput } from "@/lib/schema";

type Fixture = { id: string; brief: MapBriefInput };

const fixtures: Fixture[] = [
  {
    id: "italian-bread",
    brief: {
      topic: "Regional Italian breads",
      audience: "Curious bakers",
      tone: "Concrete, picturable",
      combines: "Map breads by visible grain mix and crumb scaffold against crust treatment.",
      candidateDimensions: ["Grain", "Crust finish"],
      inferDimensions: false,
      mustIncludeExamples: ["Pane di Altamura", "Ciabatta", "Focaccia"],
      mustAvoid: [],
      extraContext: "Photograph the loaf cross-section + crust on slate.",
    },
  },
  {
    id: "kitchen-knives",
    brief: {
      topic: "Kitchen knife styles",
      audience: "Curious cooks",
      tone: "Concrete, photographic",
      combines: "Map knives by silhouette against bolster geometry.",
      candidateDimensions: ["Blade silhouette", "Bolster transition"],
      inferDimensions: false,
      mustIncludeExamples: ["Gyuto", "Santoku", "Petty", "Slicer"],
      mustAvoid: [],
      extraContext: "Each cell is a single spine-down board photograph.",
    },
  },
  {
    id: "running-shoes",
    brief: {
      topic: "Performance running sneakers",
      audience: "Runners",
      tone: "Concrete, photographic",
      combines: "Map shoes by midsole stack against upper construction.",
      candidateDimensions: ["Midsole stack", "Upper build"],
      inferDimensions: false,
      mustIncludeExamples: ["Nike Vaporfly", "Asics Nimbus", "On Cloudmonster"],
      mustAvoid: [],
      extraContext: "Every cell is one lateral studio shot of a single shoe.",
    },
  },
  {
    id: "espresso-machines",
    brief: {
      topic: "Prosumer espresso machines",
      audience: "Coffee enthusiasts",
      tone: "Concrete, photographic",
      combines: "Map machines by visible boiler architecture against group layout.",
      candidateDimensions: ["Boiler architecture", "Group layout"],
      inferDimensions: false,
      mustIncludeExamples: ["Rancilio Silvia", "La Marzocco Linea Mini"],
      mustAvoid: [],
      extraContext: "Front-on countertop photo per cell.",
    },
  },
];

const args = process.argv.slice(2);
function takeFlag(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}
const fixturesFilter = takeFlag("--fixtures")?.split(",");
const iters = Number(takeFlag("--iters") ?? 1);

function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}
function pct(n: number, total: number) {
  return total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`;
}
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

type RunRecord = {
  fixture: string;
  iter: number;
  status: string;
  wallMs: number;
  stages: Array<{ stageId: string; durationMs: number; extras?: Record<string, unknown>; retryCount?: number; externalCallCount?: number }>;
};

async function runOne(fixture: Fixture, iter: number): Promise<RunRecord> {
  const collector = new GenerationMetricsCollector();
  const t0 = Date.now();
  const out = await buildMapJob(fixture.brief, undefined, collector);
  const wallMs = Date.now() - t0;
  const finalized = collector.finalize();
  return {
    fixture: fixture.id,
    iter,
    status: out.result.status,
    wallMs,
    stages: finalized.stages.map((s) => ({
      stageId: s.stageId,
      durationMs: s.durationMs,
      extras: s.extras,
      retryCount: s.retryCount,
      externalCallCount: s.externalCallCount,
    })),
  };
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY not set. Either:");
    console.error("  1) run `vercel env pull .env.local --yes` and re-run, or");
    console.error("  2) export OPENROUTER_API_KEY=... in your shell.");
    process.exit(1);
  }
  const hasSerp = Boolean(process.env.SERPAPI_API_KEY);
  console.log(`SerpApi: ${hasSerp ? "ENABLED — anchor/gap/reference stages will run" : "DISABLED — those stages will short-circuit"}`);

  const queue: Fixture[] = (fixturesFilter
    ? fixtures.filter((f) => fixturesFilter.includes(f.id))
    : fixtures);
  if (!queue.length) {
    console.error("no fixtures matched filter");
    process.exit(1);
  }

  const runs: RunRecord[] = [];
  for (const fixture of queue) {
    for (let i = 0; i < iters; i++) {
      console.log(`\n[${fixture.id}#${i + 1}] starting…`);
      const t0 = Date.now();
      try {
        const r = await runOne(fixture, i + 1);
        runs.push(r);
        console.log(`[${fixture.id}#${i + 1}] ${r.status} in ${fmtMs(r.wallMs)}  stages=${r.stages.length}`);
      } catch (err) {
        const dur = Date.now() - t0;
        console.error(`[${fixture.id}#${i + 1}] error after ${fmtMs(dur)}:`, err);
      }
    }
  }

  const successes = runs.filter((r) => r.status === "success");
  if (!successes.length) {
    console.error("\nNo successful runs to aggregate. Failed-run records:");
    for (const r of runs) console.error(`  ${r.fixture}#${r.iter}: ${r.status}`);
    process.exit(1);
  }

  const wallList = successes.map((r) => r.wallMs).sort((a, b) => a - b);
  const wallP50 = percentile(wallList, 0.5);
  const wallP90 = percentile(wallList, 0.9);

  const stagesByName = new Map<string, number[]>();
  const extCalls = new Map<string, number[]>();
  const cellsBatchExtras: Array<{ duration: number; batches: number }> = [];
  const skelRetryRunIds = new Set<number>();
  let fallbacks = 0;
  let cellsRetries = 0;

  successes.forEach((r, idx) => {
    let usedFallback = false;
    for (const s of r.stages) {
      const arr = stagesByName.get(s.stageId) ?? [];
      arr.push(s.durationMs);
      stagesByName.set(s.stageId, arr);
      if (typeof s.externalCallCount === "number") {
        const earr = extCalls.get(s.stageId) ?? [];
        earr.push(s.externalCallCount);
        extCalls.set(s.stageId, earr);
      }
      if (s.stageId === "skeleton_visual_probe_retry") skelRetryRunIds.add(idx);
      if (s.stageId === "cells_batches") {
        cellsRetries += s.retryCount ?? 0;
        const b = (s.extras?.batchCount as number) ?? 0;
        if (b > 0) cellsBatchExtras.push({ duration: s.durationMs, batches: b });
      }
      // crude fallback detection via stage extras / attempts
      const attempts = (s.extras?.attempts as Array<{ model?: string }> | undefined) ?? [];
      if (attempts.length > 1) usedFallback = true;
    }
    if (usedFallback) fallbacks++;
  });

  const aggregated = Array.from(stagesByName.entries())
    .map(([stageId, ds]) => {
      const sorted = [...ds].sort((a, b) => a - b);
      const eCalls = (extCalls.get(stageId) ?? []).sort((a, b) => a - b);
      return {
        stageId,
        count: ds.length,
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        mean: Math.round(mean(sorted)),
        externalCallsP50: percentile(eCalls, 0.5),
      };
    })
    .sort((a, b) => b.p50 - a.p50);

  const stageP50 = (id: string) => aggregated.find((s) => s.stageId === id)?.p50 ?? 0;

  // Projections
  const anchorP50 = stageP50("anchor_verification");
  const gapP50 = stageP50("gap_verification");
  const refsP50 = stageP50("reference_images_enrichment");
  const offCritical = anchorP50 + gapP50 + refsP50;

  const cellsBatchesP50 = stageP50("cells_batches");
  const medianBatchCount = (() => {
    const bs = cellsBatchExtras.map((x) => x.batches).sort((a, b) => a - b);
    return bs.length ? bs[Math.floor(bs.length / 2)] : 0;
  })();
  let concurrencyGain = 0;
  if (medianBatchCount > 0 && cellsBatchesP50 > 0) {
    const cur = Math.ceil(medianBatchCount / 2);
    const next = Math.ceil(medianBatchCount / 4);
    const per = cellsBatchesP50 / cur;
    concurrencyGain = per * (cur - next);
  }

  const skelRetryRate = skelRetryRunIds.size / successes.length;
  const skelRetryGain = stageP50("skeleton_visual_probe_retry") * skelRetryRate;

  console.log(`\n## Generation pipeline timing — ${successes.length} successful run(s)\n`);
  console.log(`Wall time: p50=${fmtMs(wallP50)}  p90=${fmtMs(wallP90)}  individual=[${wallList.map(fmtMs).join(", ")}]`);
  console.log(`Quality: fallback model usage in ${fallbacks}/${successes.length} runs · skeleton retry in ${(skelRetryRate * 100).toFixed(0)}% · total cells parse retries=${cellsRetries}`);

  console.log("\nPer stage (sorted by p50):");
  console.log("  stage_id                                  n   p50      p90      mean    share(p50)   ext_p50");
  for (const s of aggregated) {
    console.log(
      `  ${s.stageId.padEnd(40)}  ${String(s.count).padStart(2)}  ${fmtMs(s.p50).padEnd(7)}  ${fmtMs(s.p90).padEnd(7)}  ${fmtMs(s.mean).padEnd(6)}  ${pct(s.p50, wallP50).padEnd(10)}  ${s.externalCallsP50}`,
    );
  }

  console.log("\n## What-if projections (p50)\n");
  console.log(`  (A) Anchor + gap + refs OFF critical path:        −${fmtMs(offCritical)}   (${pct(offCritical, wallP50)} of wall)`);
  console.log(`  (B) Cells concurrency 2 → 4 (median ${medianBatchCount} batches):    −${fmtMs(concurrencyGain)}   (${pct(concurrencyGain, wallP50)})`);
  console.log(`  (C) Skip skeleton visual-probe retry (fires ${(skelRetryRate * 100).toFixed(0)}%):    −${fmtMs(skelRetryGain)}   (${pct(skelRetryGain, wallP50)})`);
  const combinedSaving = offCritical + concurrencyGain + skelRetryGain;
  console.log(`  Combined (A+B+C):                                  −${fmtMs(combinedSaving)}   → wall ≈ ${fmtMs(Math.max(0, wallP50 - combinedSaving))} (was ${fmtMs(wallP50)})`);

  const outDir = resolve(process.cwd(), ".generation-metrics");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `measurement-fresh-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ runs, aggregated, wallP50, wallP90 }, null, 2));
  console.log(`\nRaw measurement written to: ${outPath}`);
}

main().catch((err) => {
  console.error("measurement failed:", err);
  process.exit(1);
});
