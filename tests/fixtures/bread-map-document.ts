import type { MapDocument } from "@/lib/types";

const grains = ["Wheat", "Rye", "Rice"] as const;
const fermentations = ["None", "Yeast", "Sourdough"] as const;

function buildCells(): MapDocument["cells"] {
  const cells: MapDocument["cells"] = [];
  for (const grain of grains) {
    for (const fermentation of fermentations) {
      const id =
        grain === "Rice" && fermentation === "Sourdough"
          ? "rice-sourdough"
          : grain === "Rice" && fermentation === "Yeast"
            ? "rice-chemical"
            : `${grain}-${fermentation}`.toLowerCase();
      const gap = id === "rice-sourdough" || id === "rice-chemical";
      cells.push({
        id,
        coordinates: { grain, fermentation },
        label: `${grain} + ${fermentation}`,
        status: gap ? "gap" : "existing",
        explanation: "Fixture cell for store tests — plausible crossing with neutral copy.",
        confidence: 0.82,
        badges: gap ? ["Opportunity"] : ["Fixture"],
        examples: gap
          ? []
          : [
              {
                name: `${grain} oven fixture`,
                description:
                  "Named bakery reference long enough to satisfy example policy in unit tests.",
                coordinates: { grain, fermentation },
                status: "existing",
                brand: "Test Bench Bakery",
                evidenceNote: "Recorded benchmark loaf used only for automated checks.",
              },
            ],
      });
    }
  }
  return cells;
}

/** Valid published bread-style map used by store tests (replaces deleted seed JSON). */
export const testBreadMapDocument: MapDocument = {
  title: "Bread Map",
  slug: "bread-map",
  summary: "Fixture map of breads across grain and fermentation.",
  intro: "Bread pairs starch choice with leavening logic in ways that stay photographic.",
  domain: "Bread",
  topicFamily: "Food & Drink",
  dimensions: [
    {
      key: "grain",
      label: "Grain",
      description: "Base starch family.",
      values: [...grains],
    },
    {
      key: "fermentation",
      label: "Fermentation",
      description: "Lift and aging logic.",
      values: [...fermentations],
    },
  ],
  cells: buildCells(),
  featuredExamples: [
    {
      name: "Baguette",
      description:
        "Canonical wheat yeast loaf with crackling crust — fixture anchor for image enrichment tests.",
      coordinates: { grain: "Wheat", fermentation: "Yeast" },
      status: "existing",
      brand: "Paris Bench",
    },
    {
      name: "Injera",
      description:
        "Teff sourdough flatbread with spongy face — second fixture anchor for dedupe tests.",
      coordinates: { grain: "Rye", fermentation: "Sourdough" },
      status: "rare",
      brand: "Addis Fixture Co.",
    },
  ],
  notableGaps: [
    {
      label: "Rice sourdough niche",
      explanation: "Under-marketed crossing worth spotlighting when visualized.",
      coordinates: { grain: "Rice", fermentation: "Sourdough" },
    },
  ],
  impossibleCombos: [
    {
      label: "Uncooked slack brick",
      explanation: "Hydration and thermal path fight too hard for a stable loaf category.",
      coordinates: { grain: "Rice", fermentation: "None" },
    },
  ],
  constraints: [
    {
      label: "Gluten structure",
      kind: "physical",
      explanation: "Gas retention needs sufficient protein networks or alternate binders.",
    },
    {
      label: "Regional habit",
      kind: "cultural",
      explanation: "Many breads persist because communities recognize and repeat them.",
    },
  ],
  renderingHints: {
    accent: "#d97706",
    gradient: ["#fef3c7", "#fde68a"],
    icon: "grid",
  },
  seo: {
    title: "Bread Map | Raster test fixture",
    description: "Automated test fixture document.",
  },
};
