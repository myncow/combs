/**
 * Research Engine
 *
 * Generation quality depends on having real axes, real examples, and real
 * constraints before the structured map calls run. The web plugin cannot be
 * used in the same call as strict structured output, so this module builds a
 * compact research pack first and passes that pack into skeleton/cell prompts.
 */

import { appConfig } from "@/lib/config";
import type { GenerationMetricsCollector } from "@/lib/generation-metrics";
import type { GenerationStreamSink } from "@/lib/generation-stream";
import type { NormalizedMapBrief } from "@/lib/types";

export type ResearchFocus = "taxonomy" | "examples" | "constraints" | "visual_anchors";
export type ResearchGroundingState = "none" | "unsourced" | "sourced";

export interface ResearchEntity {
  name: string;
  /** Specific verifiable real-world entity grounding this anchor (maker, holding institution, named regional appellation, designer, expedition). Empty when none can be cited. */
  attribution?: string;
  category?: string;
  evidence?: string;
  /**
   * Mixed-form list of visual cues kept for backward compatibility. Older
   * code paths read from this; new prompts read the structured fields below
   * when present.
   */
  visualDescriptors: string[];
  /** Outline / form / posture cue. */
  silhouette?: string;
  /** Materials, finish, surface vocabulary. */
  materials?: string;
  /** Scale cues (relative size, comparison object, magnification). */
  scale?: string;
  /** Color, palette, finish vocabulary. */
  color?: string;
  /** Era / period / lineage cue (when relevant). */
  era?: string;
  citations: string[];
}

export interface ResearchSection {
  focus: ResearchFocus;
  content: string;
  sources: string[];
}

export interface ResearchContext {
  /** Whether the research pack has retrievable cited sources behind it. */
  groundingState: ResearchGroundingState;
  /** Structured context passed into generation prompts */
  summary: string;
  /** Named entities / examples extracted from all research sections */
  knownEntities: string[];
  /** URLs cited in the response */
  sources: string[];
  /** Parsed example ledger for existing and rare cells */
  entityHints: ResearchEntity[];
  /** Parsed axis/value hints for skeleton generation */
  axisHints: string[];
  /** Parsed physical, cultural, process, or taxonomy constraints */
  constraintHints: string[];
  /** Raw focused sections, useful for debugging and future audits */
  sections: ResearchSection[];
}

type ResearchBrief = Pick<
  NormalizedMapBrief,
  | "topic"
  | "combines"
  | "domain"
  | "topicFamily"
  | "dimensions"
  | "constraints"
  | "mustIncludeExamples"
  | "mustAvoid"
  | "extraContext"
>;

type AnnotationCitation = {
  type?: string;
  url_citation?: {
    url?: string;
    title?: string;
    content?: string;
  };
};

type ResearchResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: AnnotationCitation[];
    };
  }>;
  error?: { message?: string };
};

const emptyResearchContext: ResearchContext = {
  groundingState: "none",
  summary: "",
  knownEntities: [],
  sources: [],
  entityHints: [],
  axisHints: [],
  constraintHints: [],
  sections: [],
};

export function getResearchGroundingState(
  research: Pick<ResearchContext, "groundingState" | "summary" | "sources">,
): ResearchGroundingState {
  if (research.groundingState) {
    return research.groundingState;
  }
  if (!research.summary.trim()) {
    return "none";
  }
  return research.sources.length > 0 ? "sourced" : "unsourced";
}

function toResearchBrief(topicOrBrief: string | ResearchBrief, combines?: string): ResearchBrief {
  if (typeof topicOrBrief !== "string") {
    return topicOrBrief;
  }

  return {
    topic: topicOrBrief,
    combines: combines ?? "",
    domain: topicOrBrief,
    topicFamily: "General",
    dimensions: [],
    mustIncludeExamples: [],
    mustAvoid: [],
  };
}

function buildResearchRequests(brief: ResearchBrief): Array<{ focus: ResearchFocus; question: string }> {
  const dimensionHints = brief.dimensions.length
    ? brief.dimensions.map((dimension) => `${dimension.label}: ${dimension.description}`).join("; ")
    : "No locked dimensions yet; discover the strongest domain-specific axes.";
  const contextLines = [
    `Topic: ${brief.topic}`,
    `Domain: ${brief.domain}`,
    `Topic family: ${brief.topicFamily}`,
    brief.combines ? `Combination goal: ${brief.combines}` : "",
    brief.constraints ? `User constraints: ${brief.constraints}` : "",
    brief.extraContext ? `Extra context: ${brief.extraContext}` : "",
    brief.mustIncludeExamples.length ? `Must include if relevant: ${brief.mustIncludeExamples.join(", ")}` : "",
    brief.mustAvoid.length ? `Must avoid: ${brief.mustAvoid.join(", ")}` : "",
    `Dimension hints: ${dimensionHints}`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    {
      focus: "taxonomy",
      question: `${contextLines}

Find the strongest factual taxonomy for this mapping prompt. Describe axes grounded in disciplined usage (not vibes). Return plain text with this exact section:
AXES:
- Axis: <short label> | Values: <4-8 short values> | Why: <why this axis separates real examples>

Prioritize axes that expose canonical examples, rare edge cases, plausible gaps, and real impossibilities or tensions.`,
    },
    {
      focus: "examples",
      question: `${contextLines}

Find real named examples that prove cells in this taxonomy. Return plain text with this exact section:
REAL EXAMPLES:
- <example name> | <attribution: the specific verifiable entity that grounds this anchor — maker, holding institution, named designer, regional appellation tied to *this very cultivar/variety*, archaeological find-site, named expedition — or leave blank> | <category tags or likely axis values> | <why it is evidence>

Prefer specific attributable instances (catalogued specimens, chartered policies, premiered works, released SKUs—whatever matches the ontology) rather than generic headings. Invent nothing; skip fields you cannot corroborate.

Attribution rules — the second slot is for verifiability, not categorization:
- DO put: the specific maker/manufacturer, the museum or collection holding the artifact, the named designer/creator, the regional appellation tied to this specific cultivar, the named expedition/voyage, the archaeological find-site.
- DO NOT put: the topic itself or a taxonomic parent of the topic (e.g. don't write "Cactaceae" for a cactus on a cactus map, "North Indian Cuisine" for a curry on a curry map). The map's topic is already context; repeating it adds zero signal.
- DO NOT put: generic qualifiers ("Traditional", "Historical", "Modern", "Standard", "Classic", "Artisanal", "Generic", "Various").
- DO NOT put: era / dynasty / century labels that belong in the year slot ("Ptolemaic Egypt", "Roman Britain", "1st-2nd Century AD"). If you have a holding institution, use that instead; if not, omit.
- DO NOT put: certification marks alone ("PDO", "IGP", "ISO") — those are categories, not attributions.
- When in doubt, leave the slot blank. An empty attribution is strictly better than a misleading one.`,
    },
    {
      focus: "constraints",
      question: `${contextLines}

Find the domain constraints that should govern cell status. Return plain text with these exact sections:
CONSTRAINTS:
- <constraint> | <physical/cultural/economic/taste/taxonomy> | <what it makes rare, impossible, or tense>
EDGE CASES:
- <named example or combination> | <why it is rare, a gap, a tension, or impossible>`,
    },
    {
      focus: "visual_anchors",
      question: `${contextLines}

Find named, photographable anchor examples and describe how they LOOK in a single hero photo. Return plain text with this exact section:
VISUAL ANCHORS:
- Name: <example name> | Silhouette: <outline / form / posture cue> | Materials: <materials, finish, surface vocabulary> | Scale: <scale cues, magnification, comparison object> | Color: <palette, finish, light interaction> | Era: <period or lineage cue or "n/a">

Rules:
- Each line must name a real, attributable instance (catalogued specimen, released SKU, sanctioned movement, chartered policy artifact—whatever fits the ontology). Skip lines you cannot ground in a real referent.
- Silhouette/Materials/Scale/Color/Era must be picturable cues a photographer or illustrator could read off a single photograph. Avoid mood words, scores, or ranks.
- Prefer 6–12 lines covering the documented breadth of the domain: at least one canonical anchor and one rare/edge-case anchor when the literature supports it.
- Skip a field by writing "n/a" rather than guessing.`,
    },
  ];
}

async function runResearchCall({
  apiKey,
  model,
  focus,
  question,
}: {
  apiKey: string;
  model: string;
  focus: ResearchFocus;
  question: string;
}): Promise<ResearchSection | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": appConfig.openRouter.siteUrl,
        "X-Title": appConfig.openRouter.researchHttpTitle,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are Lattice’s research assembler. Produce concise factual text for taxonomy mapping prompts on any substrate (natural science, engineered systems, humanities, civic structures, expressive media).\nTreat the user-supplied axes as law; prioritize literal entity names plus axis-aligned constraints over narrative.\nPrefer verifiable nomenclature, provenance cues, cited tensions, falsifiable distinctions. Never prescribe food or beverage framings unless the topic demands it.",
          },
          {
            role: "user",
            content: question,
          },
        ],
        temperature: 0.15,
        plugins: [
          {
            id: "web",
            engine: "exa",
            max_results: 6,
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      console.warn(`Research call failed for ${focus}: ${response.status}`);
      return null;
    }

    const payload = (await response.json().catch(() => null)) as ResearchResponse | null;
    const message = payload?.choices?.[0]?.message;
    const content = typeof message?.content === "string" ? message.content.trim() : "";

    if (!content) {
      return null;
    }

    const sources = (message?.annotations ?? [])
      .filter((annotation) => annotation.type === "url_citation" && annotation.url_citation?.url)
      .map((annotation) => {
        const title = annotation.url_citation?.title ?? "Source";
        const url = annotation.url_citation?.url ?? "";
        return `${title}: ${url}`;
      });

    return {
      focus,
      content: content.slice(0, 5000),
      sources,
    };
  } catch (error) {
    console.warn(
      `Research engine failed for ${focus}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

function cleanBullet(line: string) {
  return line
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function dedupe(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const cleaned = item.trim().replace(/\s+/g, " ");
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function extractSectionBullets(text: string, headings: string[], maxItems: number) {
  const wanted = new Set(headings.map((heading) => heading.replace(/[#:\s]/g, "").toUpperCase()));
  const lines = text.split(/\r?\n/);
  const bullets: string[] = [];
  let active = false;

  for (const line of lines) {
    const heading = line.replace(/[#:\s]/g, "").toUpperCase();
    if (wanted.has(heading)) {
      active = true;
      continue;
    }

    if (active && /^[A-Z][A-Z\s/]+:?\s*$/.test(line.trim()) && !/^\s*(?:[-*]|\d+[.)])/.test(line)) {
      active = false;
      continue;
    }

    if (active && /^\s*(?:[-*]|\d+[.)])\s+/.test(line)) {
      bullets.push(cleanBullet(line));
    }
  }

  return dedupe(bullets).slice(0, maxItems);
}

function extractAxisHints(text: string) {
  const bullets = extractSectionBullets(text, ["AXES"], 20);
  return bullets
    .map((bullet) => {
      const match = bullet.match(/Axis:\s*([^|]+)(?:\|\s*Values:\s*([^|]+))?(?:\|\s*Why:\s*(.+))?/i);
      if (!match) {
        return bullet;
      }

      const label = match[1]?.trim();
      const values = match[2]?.trim();
      const why = match[3]?.trim();
      return [label ? `Axis: ${label}` : "", values ? `Values: ${values}` : "", why ? `Why: ${why}` : ""]
        .filter(Boolean)
        .join(" | ");
    })
    .filter(Boolean);
}

function extractEntityHints(text: string): ResearchEntity[] {
  const bullets = extractSectionBullets(text, ["REAL EXAMPLES"], 60);

  return bullets
    .map((bullet) => {
      const [rawName, rawAttribution, rawCategory, rawEvidence] = bullet.split("|").map((part) => part.trim());
      const name = rawName?.replace(/^Name:\s*/i, "").trim();

      if (!name || name.length < 2 || /^(example name|category|style)$/i.test(name)) {
        return null;
      }

      const visualDescriptors = dedupe(
        [rawCategory, rawEvidence]
          .filter(Boolean)
          .flatMap((part) => String(part).split(/[;,]/))
          .map((part) => cleanBullet(part))
          .filter((part) => part.length >= 4),
      ).slice(0, 5);

      const entity: ResearchEntity = {
        name,
        visualDescriptors,
        citations: [],
      };
      if (rawAttribution && !/^none|n\/a|unknown$/i.test(rawAttribution)) {
        entity.attribution = rawAttribution;
      }
      if (rawCategory) {
        entity.category = rawCategory;
      }
      if (rawEvidence) {
        entity.evidence = rawEvidence;
      }
      return entity;
    })
    .filter((entity): entity is ResearchEntity => Boolean(entity));
}

function extractConstraintHints(text: string) {
  return extractSectionBullets(text, ["CONSTRAINTS", "EDGE CASES"], 40);
}

const VISUAL_FIELD_KEYS = ["silhouette", "materials", "scale", "color", "era"] as const;

function parseVisualBullet(bullet: string): ResearchEntity | null {
  const parts = bullet.split("|").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const fields = new Map<string, string>();
  let leadingName: string | undefined;

  for (const part of parts) {
    const colonIndex = part.indexOf(":");
    if (colonIndex <= 0) {
      if (!leadingName) {
        leadingName = part;
      }
      continue;
    }
    const key = part.slice(0, colonIndex).trim().toLowerCase();
    const value = part.slice(colonIndex + 1).trim();
    if (!value || /^n\/?a$/i.test(value)) continue;
    fields.set(key, value);
  }

  const name = fields.get("name") ?? leadingName;
  if (!name || name.length < 2 || /^(example name|category|style)$/i.test(name)) {
    return null;
  }

  const visualDescriptors: string[] = [];
  const visual: Pick<ResearchEntity, "silhouette" | "materials" | "scale" | "color" | "era"> = {};
  for (const key of VISUAL_FIELD_KEYS) {
    const value = fields.get(key);
    if (value) {
      visual[key] = value;
      visualDescriptors.push(`${key}: ${value}`);
    }
  }
  if (!visualDescriptors.length) {
    return null;
  }

  return {
    name,
    visualDescriptors,
    citations: [],
    ...visual,
  };
}

function extractVisualAnchorEntities(text: string): ResearchEntity[] {
  const bullets = extractSectionBullets(text, ["VISUAL ANCHORS"], 36);
  return bullets
    .map(parseVisualBullet)
    .filter((entity): entity is ResearchEntity => Boolean(entity));
}

/**
 * Merge structured visual anchors into the example-derived entity ledger.
 * Visual fields enrich entries that share a name (case-insensitive). Visual
 * anchors that don't appear in the example ledger are appended as new entries
 * so the cell prompt can still see their picturable cues.
 */
function mergeVisualAnchors(
  primary: ResearchEntity[],
  visual: ResearchEntity[],
): ResearchEntity[] {
  const out = [...primary];
  const indexByName = new Map(out.map((entity, idx) => [entity.name.toLowerCase(), idx]));

  for (const v of visual) {
    const key = v.name.toLowerCase();
    const idx = indexByName.get(key);
    if (idx == null) {
      out.push(v);
      indexByName.set(key, out.length - 1);
      continue;
    }
    const existing = out[idx];
    out[idx] = {
      ...existing,
      silhouette: existing.silhouette ?? v.silhouette,
      materials: existing.materials ?? v.materials,
      scale: existing.scale ?? v.scale,
      color: existing.color ?? v.color,
      era: existing.era ?? v.era,
      visualDescriptors: dedupe([...existing.visualDescriptors, ...v.visualDescriptors]),
    };
  }
  return out;
}

/** Heuristic backup: extract proper nouns as candidate entity names. */
function extractProperNouns(text: string): string[] {
  const matches =
    text.match(/\b[A-Z][a-zA-Z'\-]{1,}(?:\s(?:of|de|du|la|le|the|and|&|[A-Z][a-zA-Z'\-]{1,})){0,4}/g) ?? [];

  return dedupe(matches)
    .filter(
      (entity) =>
        entity.length > 3 &&
        !["Axis", "Values", "Why", "Real Examples", "Constraints", "Edge Cases"].includes(entity) &&
        !/^(The|This|These|They|Their|There|When|What|With|Find|Return|Prioritize)\b/.test(entity),
    )
    .slice(0, 60);
}

function formatEntity(entity: ResearchEntity) {
  const visualLine = formatVisualLine(entity);
  return [
    entity.name,
    entity.attribution,
    entity.category,
    entity.evidence,
    visualLine || (entity.visualDescriptors.length ? `Visual cues: ${entity.visualDescriptors.join(", ")}` : ""),
  ]
    .filter(Boolean)
    .join(" | ");
}

function formatVisualLine(entity: ResearchEntity): string {
  const parts = [
    entity.silhouette ? `silhouette: ${entity.silhouette}` : "",
    entity.materials ? `materials: ${entity.materials}` : "",
    entity.scale ? `scale: ${entity.scale}` : "",
    entity.color ? `color: ${entity.color}` : "",
    entity.era ? `era: ${entity.era}` : "",
  ].filter(Boolean);
  return parts.length ? `Visual: ${parts.join(" · ")}` : "";
}

/** Public formatter used by skeleton/cell prompts that want only the visual ledger. */
export function formatVisualAnchorLedger(entities: ResearchEntity[], limit = 12): string {
  const withVisual = entities.filter(
    (entity) => entity.silhouette || entity.materials || entity.scale || entity.color || entity.era,
  );
  if (!withVisual.length) {
    return "";
  }
  return withVisual
    .slice(0, limit)
    .map((entity) => `- ${entity.name} | ${formatVisualLine(entity).replace(/^Visual:\s*/, "")}`)
    .join("\n");
}

function buildSummary({
  sections,
  axisHints,
  entityHints,
  constraintHints,
}: {
  sections: ResearchSection[];
  axisHints: string[];
  entityHints: ResearchEntity[];
  constraintHints: string[];
}) {
  const visualLedger = formatVisualAnchorLedger(entityHints, 18);
  const parts = [
    axisHints.length ? `AXIS HINTS:\n${axisHints.slice(0, 12).map((hint) => `- ${hint}`).join("\n")}` : "",
    entityHints.length
      ? `ENTITY LEDGER:\n${entityHints.slice(0, 35).map((entity) => `- ${formatEntity(entity)}`).join("\n")}`
      : "",
    visualLedger ? `VISUAL ANCHOR LEDGER (silhouette · materials · scale · color · era):\n${visualLedger}` : "",
    constraintHints.length
      ? `CONSTRAINT HINTS:\n${constraintHints.slice(0, 20).map((hint) => `- ${hint}`).join("\n")}`
      : "",
    sections
      .map((section) => `${section.focus.toUpperCase()} NOTES:\n${section.content.slice(0, 2200)}`)
      .join("\n\n"),
  ].filter(Boolean);

  return parts.join("\n\n").slice(0, 10000);
}

/**
 * Build grounded context using several focused web searches.
 *
 * The string overload keeps older tests/scripts working, while generation now
 * passes the full normalized brief so user context and dimensions shape search.
 */
export async function fetchResearchContext(
  topicOrBrief: string | ResearchBrief,
  combines?: string,
  sink?: GenerationStreamSink,
  collector?: GenerationMetricsCollector,
  researchModelOverride?: string,
): Promise<ResearchContext> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = researchModelOverride ?? appConfig.openRouter.researchModel;

  if (!apiKey) {
    return emptyResearchContext;
  }

  const brief = toResearchBrief(topicOrBrief, combines);
  const requests = buildResearchRequests(brief);
  sink?.({ type: "research", phase: "start" });
  const wall0 = Date.now();
  const settled = await Promise.allSettled(
    requests.map(async (request) => {
      const t0 = Date.now();
      const section = await runResearchCall({
        apiKey,
        model,
        ...request,
      });
      const durationMs = Date.now() - t0;
      return { section, focus: request.focus, durationMs };
    }),
  );

  const perFocus = settled.map((result, index) => {
    const request = requests[index];
    if (result.status === "fulfilled") {
      const { section, durationMs } = result.value;
      return {
        focus: request.focus,
        durationMs,
        sourceCount: section?.sources.length ?? 0,
        ok: Boolean(section),
      };
    }
    return {
      focus: request.focus,
      durationMs: 0,
      sourceCount: 0,
      ok: false,
    };
  });

  const sections = settled
    .map((result) => (result.status === "fulfilled" ? result.value.section : null))
    .filter((section): section is ResearchSection => Boolean(section));

  if (!sections.length) {
    sink?.({ type: "research", phase: "end", sourcesFound: 0 });
    collector?.addResearchAggregate({
      durationWallMs: Date.now() - wall0,
      perFocus,
      externalCalls: requests.length,
    });
    return emptyResearchContext;
  }

  const combinedContent = sections.map((section) => section.content).join("\n\n");
  const axisHints = extractAxisHints(combinedContent);
  const entityHintsRaw = extractEntityHints(combinedContent);
  const visualEntities = extractVisualAnchorEntities(combinedContent);
  const entityHints = mergeVisualAnchors(entityHintsRaw, visualEntities);
  const constraintHints = extractConstraintHints(combinedContent);
  const sources = dedupe(sections.flatMap((section) => section.sources)).slice(0, 24);
  const summary = buildSummary({ sections, axisHints, entityHints, constraintHints });
  const groundingState: ResearchGroundingState = summary.trim()
    ? sources.length > 0
      ? "sourced"
      : "unsourced"
    : "none";
  const knownEntities = dedupe([
    ...entityHints.map((entity) => entity.name),
    ...extractProperNouns(combinedContent),
  ]).slice(0, 80);
  sink?.({ type: "research", phase: "end", sourcesFound: sources.length });

  collector?.addResearchAggregate({
    durationWallMs: Date.now() - wall0,
    perFocus,
    externalCalls: requests.length,
  });

  return {
    groundingState,
    summary,
    knownEntities,
    sources,
    entityHints,
    axisHints,
    constraintHints,
    sections,
  };
}
