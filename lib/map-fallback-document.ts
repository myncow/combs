import { mapDocumentSchema } from "@/lib/schema";
import type { MapConstraint, MapDocument, MapExample, NormalizedMapBrief } from "@/lib/types";
import { slugify, titleCase } from "@/lib/utils";
import { attachVisualSeries } from "@/lib/visual-series";

const DIMENSION_VALUE_PRESETS: Record<string, string[]> = {
  material: ["Natural", "Mixed", "Synthetic"],
  "material-basis": ["Natural", "Hybrid", "Synthetic"],
  structure: ["Simple", "Layered", "Dense"],
  process: ["Fresh", "Aged", "Fermented"],
  context: ["Everyday", "Regional", "Experimental"],
  grain: ["Wheat", "Rye", "Rice"],
  fermentation: ["None", "Yeast", "Sourdough"],
  cooking: ["Baked", "Steamed", "Fried"],
  sweetness: ["Dry", "Balanced", "Sweet"],
  freshness: ["Airy", "Green", "Resinous"],
};

function buildValueSet(label: string) {
  return DIMENSION_VALUE_PRESETS[slugify(label)] ?? ["Low", "Middle", "High"];
}

function statusForIndex(index: number, total: number) {
  if (index === 0 || index === total - 1) {
    return "existing" as const;
  }
  if (index % 4 === 1) {
    return "rare" as const;
  }
  if (index % 4 === 2) {
    return "gap" as const;
  }
  return "impossible" as const;
}

function dedupeExamples(examples: MapExample[]) {
  return Array.from(
    new Map(
      examples
        .filter((example) => example.name)
        .map((example) => [example.name.toLowerCase(), example]),
    ).values(),
  );
}

function defaultDimensions(brief: NormalizedMapBrief) {
  const dimensions = [...brief.dimensions];
  const generic = [
    {
      key: "structure",
      label: "Structure",
      description: "A core axis that helps explain meaningful variation within the domain.",
    },
    {
      key: "process",
      label: "Process",
      description: "A second axis that users can intuitively scan on a visual map.",
    },
  ];

  for (const dimension of generic) {
    if (dimensions.length >= 2) break;
    if (!dimensions.some((existing) => existing.key === dimension.key)) {
      dimensions.push(dimension);
    }
  }

  return dimensions.slice(0, 2).map((dimension) => ({
    ...dimension,
    values: buildValueSet(dimension.label),
  }));
}

export function buildFallbackMapDocument(
  brief: NormalizedMapBrief,
  options?: {
    slug?: string;
    title?: string;
    seoTitle?: string;
    seoDescription?: string;
  },
): MapDocument {
  const dimensions = defaultDimensions(brief);
  const x = dimensions[0]!;
  const y = dimensions[1]!;

  const cells = x.values.flatMap((xValue, xIndex) =>
    y.values.map((yValue, yIndex) => {
      const index = xIndex * y.values.length + yIndex;
      const status = statusForIndex(index, x.values.length * y.values.length);
      const coordinates: Record<string, string> = {
        [x.key]: xValue,
        [y.key]: yValue,
      };

      const examples: MapExample[] =
        status === "existing"
          ? [
              {
                name: `${titleCase(brief.topic)} anchor ${index + 1}a`,
                description: "Synthetic draft anchor.",
                coordinates,
                status,
              },
              {
                name: `${titleCase(brief.topic)} anchor ${index + 1}b`,
                description: "Synthetic corroborating draft.",
                coordinates,
                status,
              },
            ]
          : status === "rare"
            ? [
                {
                  name: `${titleCase(brief.topic)} lone instance ${index + 1}`,
                  description: "Synthetic niche draft.",
                  coordinates,
                  status,
                },
              ]
            : [];

      return {
        id: `${x.key}-${xValue}-${y.key}-${yValue}`.toLowerCase().replace(/\s+/g, "-"),
        coordinates,
        label: `${xValue} ${yValue} ${brief.domain}`,
        status,
        explanation:
          status === "impossible"
            ? "This combination fights the core constraints of the domain, so it is better treated as a thought experiment than a real category."
            : status === "gap"
              ? "This cell feels plausible but under-developed, which makes it an interesting frontier for exploration."
              : status === "rare"
                ? "This is a niche or regional combination that exists but is not a dominant archetype."
                : "This combination is well represented and helps anchor the map.",
        confidence: status === "existing" ? 0.91 : status === "rare" ? 0.72 : 0.58,
        badges: status === "gap" ? ["Opportunity"] : status === "impossible" ? ["Constraint"] : ["Known"],
        examples,
      };
    }),
  );

  const featuredExamples = dedupeExamples(cells.flatMap((cell) => cell.examples)).slice(0, 8);
  const title = options?.title ?? `${titleCase(brief.topic)} Map`;
  const seoTitle = options?.seoTitle ?? `${titleCase(brief.topic)} Map | Lattice`;
  const seoDescription = options?.seoDescription ?? `Explore a generated map for ${brief.domain.toLowerCase()}.`;

  const draft = {
    title,
    slug: options?.slug ?? slugify(`${brief.topic}-map`),
    summary: `A structured map of ${brief.domain.toLowerCase()} across ${x.label.toLowerCase()} and ${y.label.toLowerCase()}.`,
    intro: `This map explores ${brief.domain.toLowerCase()} as a constrained combinatorial space. It highlights which combinations are canonical, which are rare, which look promising, and which collapse under the domain's underlying rules.`,
    domain: brief.domain,
    topicFamily: brief.topicFamily,
    dimensions,
    cells,
    featuredExamples,
    notableGaps: cells
      .filter((cell) => cell.status === "gap")
      .slice(0, 3)
      .map((cell) => ({
        label: cell.label,
        explanation: cell.explanation,
        coordinates: cell.coordinates,
      })),
    impossibleCombos: cells
      .filter((cell) => cell.status === "impossible")
      .slice(0, 3)
      .map((cell) => ({
        label: cell.label,
        explanation: cell.explanation,
        coordinates: cell.coordinates,
      })),
    constraints: [
      {
        label: "Physical viability",
        kind: "physical",
        explanation: "Some combinations break texture, process, or material constraints before they can become stable categories.",
      },
      {
        label: "Cultural lineage",
        kind: "cultural",
        explanation: "Many existing cells are preserved by tradition, while some plausible gaps remain underexplored because no lineage reinforced them.",
      },
      {
        label: "Naming pressure",
        kind: "taxonomy",
        explanation: "The map groups only combinations that can hold together as recognizable categories instead of one-off novelties.",
      },
    ] as MapConstraint[],
    renderingHints: {
      accent: "#d97706",
      gradient: ["#fef3c7", "#fde68a"],
      icon: "grid",
    },
    seo: {
      title: seoTitle,
      description: seoDescription,
    },
  };

  return mapDocumentSchema.parse(attachVisualSeries(draft));
}
