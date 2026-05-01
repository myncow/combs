import { aggregateTokenUsage, GenerationMetricsCollector } from "@/lib/generation-metrics";
import { buildMapJob } from "@/lib/map-engine";
import type { MapBriefInput } from "@/lib/schema";

const fixtures: MapBriefInput[] = [
  {
    topic: "French pastry lamination tradeoffs",
    audience: "Curious cooks",
    tone: "Informative",
    combines: "",
    candidateDimensions: [],
    inferDimensions: false,
    mustIncludeExamples: [],
    mustAvoid: [],
    extraContext: "Focus on lamination regimes.",
  },
];

function printStages(label: string, metrics: ReturnType<GenerationMetricsCollector["finalize"]>) {
  console.log(`\n${label}`);
  for (const s of metrics.stages) {
    const parts = [
      s.stageId,
      `${Math.round(s.durationMs)}ms`,
      s.externalCallCount != null ? `calls:${s.externalCallCount}` : null,
      s.retryCount != null ? `retry:${s.retryCount}` : null,
    ].filter(Boolean);
    console.log(" ", parts.join(" · "));
  }
  const tok = aggregateTokenUsage(metrics.stages);
  if (tok) console.log(" tokens:", tok);
}

async function runProfile() {
  const label = `[profile] OPENROUTER key ${process.env.OPENROUTER_API_KEY ? "set" : "missing"}`;
  for (let i = 0; i < fixtures.length; i++) {
    const collector = new GenerationMetricsCollector();
    const brief = fixtures[i];
    if (!brief) continue;
    const out = await buildMapJob(brief, undefined, collector);
    printStages(`${label} · prompt ${i + 1}`, collector.finalize());
    console.log(" outcome:", out.result.status);
  }
}

runProfile().catch((e) => {
  console.error(e);
  process.exit(1);
});
