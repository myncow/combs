import { aggregateTokenUsage, GenerationMetricsCollector } from "@/lib/generation-metrics";
import { textContainsTaxonomyWord } from "@/lib/sanitize-taxonomy";
import { buildMapJob } from "@/lib/map-engine";
import type { MapBriefInput } from "@/lib/schema";
import type { MapDocument } from "@/lib/types";

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
  {
    topic: "Modular synth signal paths",
    audience: "Beginners",
    tone: "Practical",
    combines: "",
    candidateDimensions: [],
    inferDimensions: true,
    mustIncludeExamples: [],
    mustAvoid: [],
    extraContext: "Hardware Eurorack; avoid purely software plugins.",
  },
  {
    topic: "Urban tree planting constraints",
    audience: "Planners",
    tone: "Concise",
    combines: "",
    candidateDimensions: [],
    inferDimensions: true,
    mustIncludeExamples: [],
    mustAvoid: [],
    extraContext: "Street ROW, soil volume, utilities.",
  },
];

function userVisibleDocumentConcat(doc: MapDocument): string {
  const chunks: string[] = [
    doc.title,
    doc.summary,
    doc.intro,
    doc.domain,
    doc.topicFamily,
    ...doc.dimensions.flatMap((d) => [d.label, d.description, ...d.values]),
    doc.seo.title,
    doc.seo.description,
    ...doc.constraints.flatMap((c) => [c.label, c.explanation]),
    ...doc.notableGaps.flatMap((g) => [g.label, g.explanation]),
    ...doc.impossibleCombos.flatMap((g) => [g.label, g.explanation]),
    ...doc.renderingHints.gradient,
    doc.renderingHints.accent,
    doc.renderingHints.icon ?? "",
  ];
  for (const cell of doc.cells) {
    chunks.push(cell.label, cell.explanation, ...cell.badges);
    for (const ex of cell.examples) {
      chunks.push(ex.name, ex.description, ex.evidenceNote ?? "", ex.attribution ?? "", ex.year ?? "");
      for (const img of ex.referenceImages ?? []) {
        if (img.title) chunks.push(img.title);
        if (img.source) chunks.push(img.source);
      }
    }
    if (cell.visualization?.caption) {
      chunks.push(cell.visualization.caption);
    }
  }
  for (const ex of doc.featuredExamples) {
    chunks.push(ex.name, ex.description, ex.evidenceNote ?? "", ex.attribution ?? "", ex.year ?? "");
    for (const img of ex.referenceImages ?? []) {
      if (img.title) chunks.push(img.title);
      if (img.source) chunks.push(img.source);
    }
  }
  if (doc.visualSeries) {
    chunks.push(doc.visualSeries.label, doc.visualSeries.overview);
    const s = doc.visualSeries.styleSpec;
    chunks.push(
      s.medium,
      s.composition,
      s.background,
      s.lighting,
      s.palette,
      s.surfaceFeel,
      ...s.negativePrompts,
    );
  }
  return chunks.filter(Boolean).join("\n");
}

function summarizeDocument(doc: MapDocument | null): void {
  if (!doc) {
    console.log("  (no document)");
    return;
  }
  const visible = userVisibleDocumentConcat(doc);
  if (textContainsTaxonomyWord(visible)) {
    console.warn("  WARN: taxonomy-family wording still appears in user-visible copy.");
  }
  const statuses = doc.cells.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `  title: ${doc.title}\n  axes: ${doc.dimensions.map((d) => `${d.label}[${d.values.join(",")}]`).join(" × ")}\n  cell status counts:`,
    statuses,
  );
  const gaps = doc.cells.filter((c) => c.status === "gap").slice(0, 2);
  for (const g of gaps) {
    console.log(`  gap sample (${JSON.stringify(g.coordinates)}): ${g.label} — ${g.explanation.slice(0, 160)}…`);
  }
}

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
  const labelBase = `[profile] OPENROUTER key ${process.env.OPENROUTER_API_KEY ? "set" : "missing"}`;
  for (let i = 0; i < fixtures.length; i++) {
    const collector = new GenerationMetricsCollector();
    const brief = fixtures[i];
    if (!brief) continue;
    const out = await buildMapJob(brief, undefined, collector);
    printStages(`${labelBase} · prompt ${i + 1}: ${brief.topic}`, collector.finalize());
    console.log(" outcome:", out.result.status);
    summarizeDocument(out.document);
  }
}

runProfile().catch((e) => {
  console.error(e);
  process.exit(1);
});
