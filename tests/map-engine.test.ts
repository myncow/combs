import { describe, expect, it } from "vitest";
import {
  buildMapJob,
  canAutoPublish,
  exampleParentIdentity,
  formatResearchForPrompt,
  hasConcreteExample,
  heuristicMapDocument,
  normalizeMapBrief,
  sanitizeMapTitle,
  stripTaxonomyWords,
  suggestAxisPairs,
} from "@/lib/map-engine";
import { mapDocumentSchema } from "@/lib/schema";
import type { MapDocument, MapExample, NormalizedMapBrief } from "@/lib/types";
import type { ResearchContext } from "@/lib/research-engine";
import { testBreadMapDocument } from "./fixtures/bread-map-document";

function briefFixture(overrides: Partial<NormalizedMapBrief> = {}): NormalizedMapBrief {
  return {
    topic: "Flowering Plants",
    combines: "form and symmetry",
    candidateDimensions: [],
    inferDimensions: true,
    audience: "Curious enthusiasts",
    tone: "Editorial",
    mustIncludeExamples: [],
    mustAvoid: [],
    domain: "Flowering Plants",
    topicFamily: "Design",
    dimensions: [
      { key: "form", label: "Form", description: "Shape" },
      { key: "symmetry", label: "Symmetry", description: "Symmetry axis" },
    ],
    accepted: true,
    guidance: ["ok"],
    ...overrides,
  };
}

function withEvidencePolicyFixture(doc: MapDocument): MapDocument {
  return {
    ...doc,
    cells: doc.cells.map((cell) => {
      const proofs = cell.examples.filter(hasConcreteExample);
      if (cell.status === "existing" && proofs.length < 2) {
        const anchor = proofs[0];
        const second =
          anchor && proofs.length === 1
            ? {
                name: `${anchor.name} companion`,
                description: "Independent corroborating fixture example for this matrix cell.",
                coordinates: { ...cell.coordinates },
                status: "existing" as const,
                attribution: "Separate fixture producer",
                evidenceNote: "Independent benchmark used to keep fixture evidence policy realistic.",
              }
            : {
                name: "Corroborating reference",
                description: "Second defensible instance for this matrix cell.",
                coordinates: { ...cell.coordinates },
                status: "existing" as const,
                evidenceNote: "Documented benchmark commonly cited for this combination.",
              };
        const examples =
          anchor && proofs.length === 1
            ? [anchor, second]
            : [
                second,
                {
                  ...second,
                  name: "Independent corroborating reference",
                  attribution: "Separate producer",
                },
              ];
        return {
          ...cell,
          examples,
        };
      }
      if (cell.status === "rare" && proofs.length < 1) {
        return {
          ...cell,
          status: "gap" as const,
        };
      }
      return cell;
    }),
  };
}

function exampleFixture(overrides: Partial<MapExample>): MapExample {
  return {
    name: "Test Item",
    description: "Test",
    coordinates: { a: "1", b: "2" },
    status: "existing",
    ...overrides,
  };
}

describe("map engine", () => {
  it("suggestAxisPairs returns bounded pairs without OpenRouter", async () => {
    const res = await suggestAxisPairs({
      topic: "Heritage knitwear",
      combines: "",
      candidateDimensions: [],
      inferDimensions: true,
      audience: "Curious enthusiasts",
      tone: "Editorial and exploratory",
      mustIncludeExamples: [],
      mustAvoid: [],
    });
    expect(res.pairs.length).toBe(4);
    expect(res.pairs[0].primary.label.length).toBeGreaterThan(1);
    expect(res.pairs[0].secondary.label.length).toBeGreaterThan(1);
  });

  it("requires substantive evidence for concrete examples", () => {
    expect(hasConcreteExample(exampleFixture({ attribution: "Acme" }))).toBe(true);
    expect(hasConcreteExample(exampleFixture({ evidenceNote: "x".repeat(12) }))).toBe(true);
    expect(hasConcreteExample(exampleFixture({ evidenceNote: "x".repeat(11) }))).toBe(false);
    expect(hasConcreteExample(exampleFixture({ description: "y".repeat(48), evidenceNote: "" }))).toBe(true);
    expect(hasConcreteExample(exampleFixture({ description: "y".repeat(47) }))).toBe(false);
    expect(hasConcreteExample(exampleFixture({ name: "", attribution: "X" }))).toBe(false);
  });

  it("rejects placeholder anchors with generic attribution or name strings", () => {
    expect(
      hasConcreteExample(
        exampleFixture({ name: "Stability Max-Cushion Trainer", attribution: "Industry Standard" }),
      ),
    ).toBe(false);
    expect(
      hasConcreteExample(
        exampleFixture({ name: "Concept Recovery Cruiser", attribution: "Generic Prototype" }),
      ),
    ).toBe(false);
    expect(
      hasConcreteExample(
        exampleFixture({
          name: "Custom Bunka Prototype",
          description: "y".repeat(80),
        }),
      ),
    ).toBe(false);
    expect(
      hasConcreteExample(exampleFixture({ name: "Hoka Bondi 9", attribution: "Hoka" })),
    ).toBe(true);
  });

  it("rejects modified anchors as concrete evidence", () => {
    expect(
      hasConcreteExample(exampleFixture({ name: "Linea Mini (Paddle Mod)", attribution: "La Marzocco" })),
    ).toBe(false);
    expect(
      hasConcreteExample(exampleFixture({ name: "Custom GS/3 Retrofit", attribution: "La Marzocco" })),
    ).toBe(false);
  });

  it("collapses obvious family variants to one parent identity", () => {
    expect(
      exampleParentIdentity({ name: "Linea Mini", attribution: "La Marzocco" }),
    ).toBe(exampleParentIdentity({ name: "Linea Mini R", attribution: "La Marzocco" }));
    expect(
      exampleParentIdentity({ name: "Lelit Bianca", attribution: "Lelit" }),
    ).toBe(exampleParentIdentity({ name: "Lelit Bianca V3", attribution: "Lelit" }));
  });

  it("test fixture document validates schema", () => {
    const parsed = mapDocumentSchema.safeParse(testBreadMapDocument);

    expect(parsed.success).toBe(true);
    expect(testBreadMapDocument.cells.length).toBe(9);
    expect(testBreadMapDocument.cells.some((cell) => cell.status === "gap")).toBe(true);
  });

  it("fails closed without an API key instead of publishing a heuristic map", async () => {
    const normalized = await normalizeMapBrief({
      topic: "Tea",
      combines: "oxidation, roast, and form",
      candidateDimensions: ["oxidation", "roast", "form"],
      inferDimensions: true,
      audience: "Design-minded tea drinkers",
      tone: "Clear",
      constraints: "",
      mustIncludeExamples: ["sencha"],
      mustAvoid: [],
      extraContext: "Keep it grounded in real processing constraints.",
    });

    expect(normalized.accepted).toBe(true);

    const job = await buildMapJob({
      topic: "Tea",
      combines: "oxidation, roast, and form",
      candidateDimensions: ["oxidation", "roast", "form"],
      inferDimensions: true,
      audience: "Design-minded tea drinkers",
      tone: "Clear",
      constraints: "",
      mustIncludeExamples: ["sencha"],
      mustAvoid: [],
      extraContext: "Keep it grounded in real processing constraints.",
    });

    expect(job.result.status).toBe("failed");
    expect(job.result.error).toBe("Grounded generation unavailable.");
    expect(job.result.guidance).toContain(
      "Grounded generation unavailable; try again when model access is configured.",
    );
    expect(job.document).toBeNull();
  });

  it("checks auto-publish thresholds", async () => {
    const doc = withEvidencePolicyFixture(testBreadMapDocument);

    expect(canAutoPublish(doc)).toBe(true);
    expect(canAutoPublish({ ...doc, notableGaps: [], impossibleCombos: [] })).toBe(false);
  });

  it("keeps the heuristic helper non-publishable even though the structure validates", () => {
    const doc = heuristicMapDocument(briefFixture());

    expect(mapDocumentSchema.safeParse(doc).success).toBe(true);
    expect(canAutoPublish(doc)).toBe(false);
  });

  describe("formatResearchForPrompt", () => {
    const researchBase: Omit<ResearchContext, "groundingState" | "summary" | "sources"> = {
      knownEntities: ["Example One"],
      entityHints: [],
      axisHints: ["Axis: Form | Values: Upright, Spreading | Why: visible separation"],
      constraintHints: ["Constraint | physical | keeps some crossings rare"],
      sections: [],
    };

    it("labels sourced research as grounded evidence", () => {
      const prompt = formatResearchForPrompt(
        {
          ...researchBase,
          groundingState: "sourced",
          summary: "Documented notes.",
          sources: ["Source A: https://example.com/a"],
        },
        "skeleton",
      );

      expect(prompt).toContain("GROUNDED RESEARCH PACK");
      expect(prompt).not.toContain("UNSOURCED RESEARCH NOTES");
    });

    it("demotes unsourced research to weak brainstorming", () => {
      const prompt = formatResearchForPrompt(
        {
          ...researchBase,
          groundingState: "unsourced",
          summary: "Model-synthesized notes.",
          sources: [],
        },
        "cells",
      );

      expect(prompt).toContain("UNSOURCED RESEARCH NOTES");
      expect(prompt).toContain("No cited sources were retrieved.");
      expect(prompt).toContain("weak brainstorming");
    });

    it("omits the research section entirely when no research exists", () => {
      const prompt = formatResearchForPrompt(
        {
          ...researchBase,
          groundingState: "none",
          summary: "",
          sources: [],
        },
        "skeleton",
      );

      expect(prompt).toBe("");
    });
  });

  describe("sanitizeMapTitle", () => {
    it("strips taxonomy words from a title and keeps the remainder", () => {
      const brief = briefFixture({ topic: "Flowers" });
      const cleaned = sanitizeMapTitle("Floral Morphological Taxonomy", brief);

      expect(cleaned).not.toMatch(/taxonom/i);
      expect(cleaned.toLowerCase()).toContain("floral");
      expect(cleaned.toLowerCase()).toContain("morphological");
    });

    it("handles trailing separators after stripping", () => {
      const brief = briefFixture({ topic: "Office Seating" });
      expect(sanitizeMapTitle("Office Seating — Taxonomy", brief)).toBe("Office Seating");
      expect(sanitizeMapTitle("Taxonomy: Sunglasses Map", brief)).toBe("Sunglasses Map");
    });

    it("falls back to `<Topic> Map` when input is empty or degenerate", () => {
      const brief = briefFixture({ topic: "Tea Processing" });

      expect(sanitizeMapTitle("", brief)).toBe("Tea Processing Map");
      expect(sanitizeMapTitle("Taxonomy", brief)).toBe("Tea Processing Map");
      expect(sanitizeMapTitle("   ---   ", brief)).toBe("Tea Processing Map");
    });

    it("derives fallback title from first significant words and skips articles", () => {
      const brief = briefFixture({ topic: "The History of Bread" });
      expect(sanitizeMapTitle("", brief)).toBe("History Bread Map");
    });

    it("falls back to the domain when the topic is missing", () => {
      const brief = briefFixture({ topic: "", domain: "Cheese" });
      expect(sanitizeMapTitle("Taxonomy", brief)).toBe("Cheese Map");
    });
  });

  describe("stripTaxonomyWords", () => {
    it("removes taxonomy/taxonomic/taxonomical case-insensitively", () => {
      expect(stripTaxonomyWords("A taxonomic guide to Taxonomy and taxonomical gaps")).toBe(
        "A guide to and gaps",
      );
    });

    it("returns empty string for empty input", () => {
      expect(stripTaxonomyWords("")).toBe("");
    });
  });
});
