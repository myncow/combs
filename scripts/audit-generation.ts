/**
 * Generation quality audit.
 *
 * Generates several maps end-to-end, persists each MapDocument as JSON, and
 * prints a quality report focused on the failure modes the user has flagged:
 *   1. Same item showing up in multiple cells (duplicate anchor names).
 *   2. Things that obviously exist marked as "rare" / "impossible" / "gap".
 *   3. Axes whose values are not visually compelling for image generation.
 *
 * Run: pnpm tsx scripts/audit-generation.ts [maps...]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { GenerationMetricsCollector } from "@/lib/generation-metrics";
import { buildMapJob } from "@/lib/map-engine";
import type { MapBriefInput } from "@/lib/schema";
import type { MapDocument } from "@/lib/types";

interface AuditFixture {
  id: string;
  brief: MapBriefInput;
}

const fixtures: AuditFixture[] = [
  {
    id: "regional-italian-bread",
    brief: {
      topic: "Regional Italian breads",
      audience: "Curious bakers",
      tone: "Concrete, picturable",
      combines:
        "Map breads by visible grain mix and crumb scaffold against crust treatment.",
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
      extraContext:
        "Each cell is a single spine-down board photograph, no captions.",
    },
  },
  {
    id: "athletic-sneakers",
    brief: {
      topic: "Performance running sneakers",
      audience: "Runners",
      tone: "Concrete, photographic",
      combines: "Map shoes by midsole stack against upper construction.",
      candidateDimensions: ["Midsole stack", "Upper build"],
      inferDimensions: false,
      mustIncludeExamples: [
        "Nike Vaporfly",
        "Asics Nimbus",
        "On Cloudmonster",
      ],
      mustAvoid: [],
      extraContext: "Every cell is one lateral studio shot of a single shoe.",
    },
  },
  {
    id: "espresso-machine-faces",
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

const OUT_DIR = path.resolve(process.cwd(), ".generation-audits");

function summarizeStatus(doc: MapDocument) {
  return doc.cells.reduce<Record<string, number>>((acc, cell) => {
    acc[cell.status] = (acc[cell.status] ?? 0) + 1;
    return acc;
  }, {});
}

function collectAnchorOccurrences(doc: MapDocument) {
  const occurrences = new Map<
    string,
    Array<{ cellLabel: string; status: string; coordinates: Record<string, string> }>
  >();
  for (const cell of doc.cells) {
    for (const ex of cell.examples) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      if (!occurrences.has(key)) occurrences.set(key, []);
      occurrences.get(key)!.push({
        cellLabel: cell.label,
        status: cell.status,
        coordinates: cell.coordinates,
      });
    }
  }
  return occurrences;
}

const KNOWN_REAL_THINGS = [
  "ciabatta",
  "focaccia",
  "pane di altamura",
  "pane toscano",
  "pane di matera",
  "michetta",
  "schiacciata",
  "piadina",
  "carta da musica",
  "pane carasau",
  "pizza bianca",
  "gyuto",
  "santoku",
  "nakiri",
  "petty",
  "deba",
  "yanagiba",
  "chef knife",
  "slicer",
  "boning knife",
  "vaporfly",
  "alphafly",
  "nimbus",
  "kayano",
  "cloudmonster",
  "ghost",
  "pegasus",
  "saucony endorphin",
  "rancilio silvia",
  "linea mini",
  "gs/3",
  "breville barista",
  "bambino plus",
  "rocket appartamento",
  "profitec pro 600",
  "lelit bianca",
  "gaggia classic",
];

function listSuspiciousStatusEntries(doc: MapDocument) {
  const suspect: Array<{ cellLabel: string; status: string; reason: string }> = [];
  for (const cell of doc.cells) {
    if (cell.status === "existing" || cell.status === "rare") continue;
    const haystack = `${cell.label} ${cell.explanation} ${cell.examples
      .map((e) => e.name)
      .join(" ")}`.toLowerCase();
    for (const known of KNOWN_REAL_THINGS) {
      if (haystack.includes(known)) {
        suspect.push({
          cellLabel: cell.label,
          status: cell.status,
          reason: `mentions known existing thing "${known}" but is marked ${cell.status}`,
        });
        break;
      }
    }
  }
  return suspect;
}

const NON_VISUAL_PATTERNS = [
  /^(low|medium|high)$/i,
  /^(simple|moderate|complex)$/i,
  /^(small|big|large)$/i,
  /^(cheap|premium|luxury)$/i,
  /^(good|bad|neutral)$/i,
  /^(fast|slow)$/i,
  /^(beginner|intermediate|advanced|expert)$/i,
  /score|index|rating|tier/i,
];

function listNonVisualValues(doc: MapDocument) {
  const issues: Array<{ axis: string; value: string }> = [];
  for (const dim of doc.dimensions) {
    for (const value of dim.values) {
      if (NON_VISUAL_PATTERNS.some((re) => re.test(value.trim()))) {
        issues.push({ axis: dim.label, value });
      }
    }
  }
  return issues;
}

function reportDoc(doc: MapDocument) {
  const lines: string[] = [];
  lines.push(`# ${doc.title}`);
  lines.push(`Domain: ${doc.domain}  ·  TopicFamily: ${doc.topicFamily}`);
  lines.push(`Cells: ${doc.cells.length}  ·  ${JSON.stringify(summarizeStatus(doc))}`);
  lines.push("Axes:");
  for (const d of doc.dimensions) {
    lines.push(`  - ${d.label} (${d.key}): [${d.values.join(", ")}]`);
  }

  const occurrences = collectAnchorOccurrences(doc);
  const dupes = [...occurrences.entries()].filter(([, list]) => list.length > 1);
  lines.push("");
  if (dupes.length === 0) {
    lines.push("Duplicate anchors: none.");
  } else {
    lines.push(`Duplicate anchors (${dupes.length}):`);
    for (const [name, list] of dupes) {
      lines.push(
        `  - "${name}" appears ${list.length}× → ${list
          .map((e) => `${e.cellLabel} [${e.status}]`)
          .join(" | ")}`,
      );
    }
  }

  const suspect = listSuspiciousStatusEntries(doc);
  lines.push("");
  if (suspect.length === 0) {
    lines.push("Suspicious statuses: none flagged.");
  } else {
    lines.push(`Suspicious statuses (${suspect.length}):`);
    for (const s of suspect) {
      lines.push(`  - ${s.cellLabel} [${s.status}] :: ${s.reason}`);
    }
  }

  const nonVisual = listNonVisualValues(doc);
  lines.push("");
  if (nonVisual.length === 0) {
    lines.push("Non-visual axis values: none flagged.");
  } else {
    lines.push(`Non-visual axis values (${nonVisual.length}):`);
    for (const n of nonVisual) {
      lines.push(`  - ${n.axis}: "${n.value}"`);
    }
  }

  lines.push("");
  lines.push("Cell-by-cell:");
  for (const cell of doc.cells) {
    const coordPretty = Object.entries(cell.coordinates)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(
      `  · [${cell.status}] ${cell.label}  (${coordPretty})  examples=${cell.examples.length}`,
    );
    for (const ex of cell.examples) {
      lines.push(`      ↳ ${ex.name}${ex.attribution ? ` — ${ex.attribution}` : ""}`);
    }
  }

  return lines.join("\n");
}

async function runOne(fixture: AuditFixture) {
  const collector = new GenerationMetricsCollector();
  const out = await buildMapJob(fixture.brief, undefined, collector);

  const reportPath = path.join(OUT_DIR, `${fixture.id}.md`);
  const docPath = path.join(OUT_DIR, `${fixture.id}.json`);

  if (out.document) {
    writeFileSync(docPath, JSON.stringify(out.document, null, 2));
    writeFileSync(reportPath, reportDoc(out.document));
    console.log(`\n=== ${fixture.id} (${out.result.status}) ===`);
    console.log(reportDoc(out.document));
  } else {
    const msg = `\n=== ${fixture.id} (${out.result.status}) ===\nNo document. error=${out.result.error}`;
    writeFileSync(reportPath, msg);
    console.log(msg);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const requested = process.argv.slice(2);
  const queue = requested.length
    ? fixtures.filter((f) => requested.includes(f.id))
    : fixtures;
  if (queue.length === 0) {
    console.error(
      `No matching fixtures. Available: ${fixtures.map((f) => f.id).join(", ")}`,
    );
    process.exit(1);
  }
  for (const fixture of queue) {
    try {
      await runOne(fixture);
    } catch (error) {
      console.error(`Generation failed for ${fixture.id}:`, error);
    }
  }
}

main();
