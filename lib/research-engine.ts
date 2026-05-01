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

export type ResearchFocus = "taxonomy" | "examples" | "constraints";

export interface ResearchEntity {
  name: string;
  brand?: string;
  category?: string;
  evidence?: string;
  visualDescriptors: string[];
  citations: string[];
}

export interface ResearchSection {
  focus: ResearchFocus;
  content: string;
  sources: string[];
}

export interface ResearchContext {
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
  summary: "",
  knownEntities: [],
  sources: [],
  entityHints: [],
  axisHints: [],
  constraintHints: [],
  sections: [],
};

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
- <example name> | <brand/origin/creator if any> | <category tags or likely axis values> | <why it is evidence>

Prefer specific attributable instances (catalogued specimens, chartered policies, premiered works, released SKUs—whatever matches the ontology) rather than generic headings. Invent nothing; skip fields you cannot corroborate.`,
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
      const [rawName, rawBrand, rawCategory, rawEvidence] = bullet.split("|").map((part) => part.trim());
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
      if (rawBrand && !/^none|n\/a|unknown$/i.test(rawBrand)) {
        entity.brand = rawBrand;
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
  return [
    entity.name,
    entity.brand,
    entity.category,
    entity.evidence,
    entity.visualDescriptors.length ? `Visual cues: ${entity.visualDescriptors.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
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
  const parts = [
    axisHints.length ? `AXIS HINTS:\n${axisHints.slice(0, 12).map((hint) => `- ${hint}`).join("\n")}` : "",
    entityHints.length
      ? `ENTITY LEDGER:\n${entityHints.slice(0, 35).map((entity) => `- ${formatEntity(entity)}`).join("\n")}`
      : "",
    constraintHints.length
      ? `CONSTRAINT HINTS:\n${constraintHints.slice(0, 20).map((hint) => `- ${hint}`).join("\n")}`
      : "",
    sections
      .map((section) => `${section.focus.toUpperCase()} NOTES:\n${section.content.slice(0, 2200)}`)
      .join("\n\n"),
  ].filter(Boolean);

  return parts.join("\n\n").slice(0, 9000);
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
): Promise<ResearchContext> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = appConfig.openRouter.researchModel;

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
  const entityHints = extractEntityHints(combinedContent);
  const constraintHints = extractConstraintHints(combinedContent);
  const sources = dedupe(sections.flatMap((section) => section.sources)).slice(0, 24);
  const citationUrls = sources.map((entry) => entry.replace(/^.*?:\s*/, "")).filter(Boolean);
  const entityHintsWithCitations = entityHints.map((entity) => ({
    ...entity,
    citations: citationUrls.slice(0, 3),
  }));
  const knownEntities = dedupe([
    ...entityHintsWithCitations.map((entity) => entity.name),
    ...extractProperNouns(combinedContent),
  ]).slice(0, 80);
  sink?.({ type: "research", phase: "end", sourcesFound: sources.length });

  collector?.addResearchAggregate({
    durationWallMs: Date.now() - wall0,
    perFocus,
    externalCalls: requests.length,
  });

  return {
    summary: buildSummary({ sections, axisHints, entityHints: entityHintsWithCitations, constraintHints }),
    knownEntities,
    sources,
    entityHints: entityHintsWithCitations,
    axisHints,
    constraintHints,
    sections,
  };
}
