import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProbeBudget } from "@/lib/visual-probe";
import {
  refineFrontierEvidence,
  verifyAnchorsViaSerp,
} from "@/lib/map-engine";
import { GenerationMetricsCollector } from "@/lib/generation-metrics";
import type { MapDocument } from "@/lib/types";
import * as serp from "@/lib/serpapi-images";

vi.mock("@/lib/serpapi-images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/serpapi-images")>();
  return {
    ...actual,
    getSerpApiKey: vi.fn(() => "test-key"),
    fetchGoogleImageExampleResults: vi.fn(),
  };
});

function verificationDoc(): MapDocument {
  return {
    title: "Verification Fixture",
    slug: "verification-fixture",
    summary: "Fixture document for anchor verification.",
    intro: "Verification fixture.",
    domain: "Machines",
    topicFamily: "General",
    dimensions: [
      {
        key: "axis_x",
        label: "Axis X",
        description: "X",
        values: ["A", "B", "C"],
      },
      {
        key: "axis_y",
        label: "Axis Y",
        description: "Y",
        values: ["1", "2", "3"],
      },
    ],
    cellSchema: {
      primaryX: "axis_x",
      primaryY: "axis_y",
    },
    cells: [
      {
        id: "a-1",
        coordinates: { axis_x: "A", axis_y: "1" },
        label: "Verified machine pair",
        status: "existing",
        explanation: "Two machines that clearly occupy this cell.",
        confidence: 0.9,
        badges: [],
        examples: [
          {
            name: "Linea Mini R",
            brand: "La Marzocco",
            description: "Verified example one.",
            coordinates: { axis_x: "A", axis_y: "1" },
            status: "existing",
          },
          {
            name: "GS3",
            brand: "La Marzocco",
            description: "Verified example two.",
            coordinates: { axis_x: "A", axis_y: "1" },
            status: "existing",
          },
        ],
      },
      {
        id: "a-2",
        coordinates: { axis_x: "A", axis_y: "2" },
        label: "Weak machine pair",
        status: "existing",
        explanation: "One anchor is real, the other should wash out.",
        confidence: 0.88,
        badges: [],
        examples: [
          {
            name: "Linea Mini",
            brand: "La Marzocco",
            description: "Verified example.",
            coordinates: { axis_x: "A", axis_y: "2" },
            status: "existing",
          },
          {
            name: "E61 Legend",
            brand: "Generic House",
            description: "Weak anchor that should fail verification.",
            coordinates: { axis_x: "A", axis_y: "2" },
            status: "existing",
          },
        ],
      },
      {
        id: "a-3",
        coordinates: { axis_x: "A", axis_y: "3" },
        label: "Weak rare machine",
        status: "rare",
        explanation: "Single weak example that should collapse to a gap.",
        confidence: 0.72,
        badges: [],
        examples: [
          {
            name: "Unknown Heritage Lever",
            brand: "Mystery Maker",
            description: "Weak anchor.",
            coordinates: { axis_x: "A", axis_y: "3" },
            status: "rare",
          },
        ],
      },
      {
        id: "b-1",
        coordinates: { axis_x: "B", axis_y: "1" },
        label: "Supported frontier",
        status: "gap",
        explanation:
          "This cell would need a compact lever frame with a fully flush digital fascia to become a stable category.",
        confidence: 0.6,
        badges: ["Verified absent"],
        examples: [],
      },
      {
        id: "b-2",
        coordinates: { axis_x: "B", axis_y: "2" },
        label: "Thin frontier",
        status: "gap",
        explanation: "Maybe something could go here.",
        confidence: 0.58,
        badges: ["Matrix repair"],
        examples: [],
      },
      {
        id: "b-3",
        coordinates: { axis_x: "B", axis_y: "3" },
        label: "Rule-blocked frontier",
        status: "impossible",
        explanation:
          "The pump geometry is mechanically incompatible with the lever stack, so the control scheme cannot coexist in one chassis.",
        confidence: 0.67,
        badges: [],
        examples: [],
      },
      {
        id: "c-1",
        coordinates: { axis_x: "C", axis_y: "1" },
        label: "Existing filler one",
        status: "existing",
        explanation: "Filler.",
        confidence: 0.86,
        badges: [],
        examples: [
          {
            name: "Profitec Drive",
            brand: "Profitec",
            description: "Filler example one.",
            coordinates: { axis_x: "C", axis_y: "1" },
            status: "existing",
          },
          {
            name: "ECM Synchronika",
            brand: "ECM",
            description: "Filler example two.",
            coordinates: { axis_x: "C", axis_y: "1" },
            status: "existing",
          },
        ],
      },
      {
        id: "c-2",
        coordinates: { axis_x: "C", axis_y: "2" },
        label: "Existing filler two",
        status: "existing",
        explanation: "Filler.",
        confidence: 0.86,
        badges: [],
        examples: [
          {
            name: "Lelit Bianca",
            brand: "Lelit",
            description: "Filler example one.",
            coordinates: { axis_x: "C", axis_y: "2" },
            status: "existing",
          },
          {
            name: "Rocket Appartamento",
            brand: "Rocket",
            description: "Filler example two.",
            coordinates: { axis_x: "C", axis_y: "2" },
            status: "existing",
          },
        ],
      },
      {
        id: "c-3",
        coordinates: { axis_x: "C", axis_y: "3" },
        label: "Existing filler three",
        status: "existing",
        explanation: "Filler.",
        confidence: 0.86,
        badges: [],
        examples: [
          {
            name: "Silvia Pro X",
            brand: "Rancilio",
            description: "Filler example one.",
            coordinates: { axis_x: "C", axis_y: "3" },
            status: "existing",
          },
          {
            name: "Ascaso Steel Duo PID",
            brand: "Ascaso",
            description: "Filler example two.",
            coordinates: { axis_x: "C", axis_y: "3" },
            status: "existing",
          },
        ],
      },
    ],
    featuredExamples: [],
    notableGaps: [],
    impossibleCombos: [],
    constraints: [
      {
        label: "Mechanical fit",
        kind: "physical",
        explanation: "Some group and control pairings are mechanically incompatible.",
      },
      {
        label: "Market habit",
        kind: "cultural",
        explanation: "Some combinations remain absent because they are awkward to sell.",
      },
    ],
    renderingHints: {
      accent: "#000",
      gradient: ["#000", "#111"],
    },
    seo: {
      title: "Verification Fixture",
      description: "Verification fixture",
    },
  };
}

beforeEach(() => {
  vi.mocked(serp.getSerpApiKey).mockReturnValue("test-key");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("map engine verification", () => {
  it("keeps strong anchors and downgrades weak cells after verification", async () => {
    vi.mocked(serp.fetchGoogleImageExampleResults).mockImplementation(async (query: string) => {
      if (/Linea Mini|GS3|Profitec Drive|ECM Synchronika|Lelit Bianca|Rocket Appartamento|Silvia Pro X|Ascaso/i.test(query)) {
        return {
          results: [
            { link: "https://a.example/1", title: query, source: "Example A" },
            { link: "https://b.example/2", title: query, source: "Example B" },
          ],
        };
      }
      return { results: [] };
    });

    const collector = new GenerationMetricsCollector();
    const verified = await verifyAnchorsViaSerp(
      verificationDoc(),
      new ProbeBudget(20),
      collector,
    );

    expect(verified.cells.find((cell) => cell.id === "a-1")?.status).toBe("existing");
    expect(verified.cells.find((cell) => cell.id === "a-2")?.status).toBe("rare");
    expect(verified.cells.find((cell) => cell.id === "a-3")?.status).toBe("gap");
    const anchorMetric = collector.finalize().stages.find((stage) => stage.stageId === "anchor_verification");
    expect(anchorMetric?.extras).toMatchObject({
      downgradedCells: 2,
    });
  });

  it("retains intrinsically strong anchors when probe evidence is sparse", async () => {
    vi.mocked(serp.fetchGoogleImageExampleResults).mockResolvedValue({
      results: [{ link: "https://example.com/linea", title: "Espresso machine gallery", source: "Example Source" }],
    });

    const collector = new GenerationMetricsCollector();
    const verified = await verifyAnchorsViaSerp(verificationDoc(), new ProbeBudget(20), collector);

    expect(verified.cells.find((cell) => cell.id === "a-1")?.status).toBe("rare");
    const anchorMetric = collector.finalize().stages.find((stage) => stage.stageId === "anchor_verification");
    expect(anchorMetric?.extras).toMatchObject({
      inconclusiveExamples: expect.any(Number),
    });
  });

  it("marks unsupported frontier cells thin and keeps them out of callouts", () => {
    const refined = refineFrontierEvidence(verificationDoc());

    expect(refined.cells.find((cell) => cell.id === "b-2")?.badges).toContain("Thin evidence");
    expect(refined.notableGaps.map((gap) => gap.label)).toContain("Supported frontier");
    expect(refined.notableGaps.map((gap) => gap.label)).not.toContain("Thin frontier");
    expect(refined.impossibleCombos.map((combo) => combo.label)).toContain("Rule-blocked frontier");
  });
});
