/**
 * Shared SerpApi probing utilities for upstream visual-gap analysis.
 *
 * Used at three points in the pipeline that the LLM-only path used to skip:
 * 1. Axis-pair suggestion: score each candidate pair by how many of its values
 *    return real Google Images thumbnails for the topic.
 * 2. Skeleton stage: confirm every dimension value yields thumbnails before
 *    burning cell-generation calls on values that aren't picturable.
 * 3. Post-cell: verify each "gap" cell's label has no canonical hit (true
 *    novel territory) or, if it does, downgrade the cell with the discovery.
 *
 * The probe is intentionally separate from `enrichMapDocumentReferenceImages`
 * (which exists only to attach images to *existing* anchors). This module
 * shares the same SerpApi infrastructure with a dedicated, smaller budget so
 * gating cannot starve reference enrichment.
 */

import { appConfig } from "@/lib/config";
import {
  fetchGoogleImageExampleResults,
  getSerpApiKey,
  normalizeExampleImageQuery,
  type ExampleImageHit,
} from "@/lib/serpapi-images";

export type ProbeResult = {
  query: string;
  hits: ExampleImageHit[];
  /** Distinct domain count across hits — a coarse proxy for "real, not single-source". */
  distinctSources: number;
  picturable: boolean;
  skipped: "no-key" | "budget" | "invalid-query" | "aborted" | null;
};

const EMPTY_RESULT = (query: string, skipped: ProbeResult["skipped"]): ProbeResult => ({
  query,
  hits: [],
  distinctSources: 0,
  picturable: false,
  skipped,
});

/** Default concurrency for SerpApi probes; tuned to match `enrichMapDocumentReferenceImages`. */
export const PROBE_DEFAULT_CONCURRENCY = 4;

/**
 * Shared, in-process probe budget. Each generation pipeline run gets its own
 * `ProbeBudget` instance via `createProbeBudget()`. The budget is enforced
 * across all stages of one generation. The single-flight memo ensures
 * repeated `probe()` calls with the same query share one network request and
 * count once against the limit.
 */
export class ProbeBudget {
  private used = 0;
  private memo = new Map<string, Promise<ProbeResult>>();

  constructor(public readonly limit: number, private readonly options?: { signal?: AbortSignal }) {}

  get callsUsed() {
    return this.used;
  }

  remaining() {
    return Math.max(0, this.limit - this.used);
  }

  /** Probe a single query, deduped via memo so repeat calls are free. */
  async probe(rawQuery: string): Promise<ProbeResult> {
    if (this.options?.signal?.aborted) {
      return EMPTY_RESULT(rawQuery, "aborted");
    }
    const apiKey = getSerpApiKey();
    if (!apiKey) {
      return EMPTY_RESULT(rawQuery, "no-key");
    }
    const q = normalizeExampleImageQuery(rawQuery);
    if (!q) {
      return EMPTY_RESULT(rawQuery, "invalid-query");
    }
    const cached = this.memo.get(q);
    if (cached) {
      return cached;
    }
    if (this.used >= this.limit) {
      return EMPTY_RESULT(q, "budget");
    }
    this.used += 1;
    const promise = fetchGoogleImageExampleResults(q, { signal: this.options?.signal })
      .then(({ results }) => buildProbeResult(q, results))
      .catch(() =>
        this.options?.signal?.aborted
          ? EMPTY_RESULT(q, "aborted")
          : EMPTY_RESULT(q, "invalid-query"),
      );
    this.memo.set(q, promise);
    return promise;
  }
}

export function createProbeBudget(limit?: number, options?: { signal?: AbortSignal }): ProbeBudget {
  const cap = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : appConfig.generation.serpProbeMaxCalls;
  return new ProbeBudget(Math.max(0, cap), options);
}

function buildProbeResult(query: string, results: ExampleImageHit[]): ProbeResult {
  const distinct = new Set<string>();
  for (const r of results) {
    if (r.source) {
      distinct.add(r.source.toLowerCase());
    } else if (r.link) {
      const host = safeHost(r.link);
      if (host) distinct.add(host);
    }
  }
  const minHits = appConfig.generation.visualProbeMinHits;
  return {
    query,
    hits: results,
    distinctSources: distinct.size,
    picturable: results.length >= minHits && distinct.size >= 1,
    skipped: null,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Build a single picturability query for a value within a topic context. */
export function axisValueProbeQuery(topic: string, axisLabel: string, value: string): string {
  const tokens = [topic, axisLabel, value]
    .map((s) => s?.toString().trim())
    .filter((s): s is string => Boolean(s));
  return tokens.join(" ").slice(0, 180);
}

type PairStat = {
  primaryHits: number;
  primaryProbed: number;
  secondaryHits: number;
  secondaryProbed: number;
  totalHits: number;
  totalValues: number;
  /**
   * Hit rate over probed values, in [0, 1]. Use the explicit `probedAny`
   * flag rather than the value of this field to distinguish "0 hits over N
   * probes" (= bad) from "0 probes ran" (= unknown).
   */
  picturableRatio: number;
  probedAny: boolean;
};

/** Pick at most `n` items from a list spread across the start, middle, and end so we sample both extremes. */
function sampleAcross<T>(items: T[], n: number): T[] {
  if (n <= 0) return [];
  if (items.length <= n) return items.slice();
  const out: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (items.length - 1)) / (n - 1 || 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(items[idx]);
    }
  }
  return out;
}

/**
 * Probe a sample of values from each pair concurrently and return per-pair
 * coverage stats. The total probe count is bounded by both `budget` and
 * `maxProbesPerPair`; values are sampled across both axes and across
 * positions (start/middle/end) so the signal is balanced even when a pair
 * has many values.
 *
 * Concurrency runs across all pairs, not per-pair. We collect requests up
 * front, deduplicate, then execute them in parallel respecting both the
 * shared budget and a fixed in-flight cap.
 */
export async function probePairsByAxisValues(
  pairs: Array<{
    primary: { label: string; values: string[] };
    secondary: { label: string; values: string[] };
  }>,
  topic: string,
  budget: ProbeBudget,
  options?: { maxProbesPerPair?: number; concurrency?: number },
): Promise<PairStat[]> {
  const out: PairStat[] = pairs.map((pair) => ({
    primaryHits: 0,
    primaryProbed: 0,
    secondaryHits: 0,
    secondaryProbed: 0,
    totalHits: 0,
    totalValues: pair.primary.values.length + pair.secondary.values.length,
    picturableRatio: 0,
    probedAny: false,
  }));

  // Sample values per pair so a tight budget still gives every pair some signal.
  const remaining = budget.remaining();
  const perPairCap = Math.max(
    1,
    Math.min(
      options?.maxProbesPerPair ?? Math.max(2, Math.floor(remaining / Math.max(1, pairs.length))),
      6,
    ),
  );
  const halfCap = Math.max(1, Math.floor(perPairCap / 2));
  const concurrency = Math.max(1, options?.concurrency ?? PROBE_DEFAULT_CONCURRENCY);

  type Job = {
    pairIndex: number;
    side: "primary" | "secondary";
    axisLabel: string;
    value: string;
  };
  const jobs: Job[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const primarySample = sampleAcross(pair.primary.values, halfCap);
    const secondarySample = sampleAcross(pair.secondary.values, halfCap);
    for (const v of primarySample) {
      jobs.push({ pairIndex: i, side: "primary", axisLabel: pair.primary.label, value: v });
    }
    for (const v of secondarySample) {
      jobs.push({ pairIndex: i, side: "secondary", axisLabel: pair.secondary.label, value: v });
    }
  }

  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      if (budget.remaining() === 0) return;
      const q = axisValueProbeQuery(topic, job.axisLabel, job.value);
      const r = await budget.probe(q);
      if (r.skipped) continue;
      const stat = out[job.pairIndex];
      const hit = r.picturable ? 1 : 0;
      if (job.side === "primary") {
        stat.primaryProbed += 1;
        stat.primaryHits += hit;
      } else {
        stat.secondaryProbed += 1;
        stat.secondaryHits += hit;
      }
      stat.totalHits += hit;
      stat.probedAny = true;
    }
  }

  const runners = Math.min(concurrency, jobs.length);
  await Promise.all(Array.from({ length: runners }, () => worker()));

  for (const stat of out) {
    const probedTotal = stat.primaryProbed + stat.secondaryProbed;
    stat.picturableRatio = probedTotal > 0 ? stat.totalHits / probedTotal : 0;
  }
  return out;
}

/** Convenience: probe a single label string with the same gate semantics. */
export async function probeLabelPicturability(
  topic: string,
  label: string,
  budget: ProbeBudget,
): Promise<ProbeResult> {
  return budget.probe(`${topic} ${label}`.trim());
}
