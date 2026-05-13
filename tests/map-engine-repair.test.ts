import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapCellsBatchInput, MapSkeletonInput, NormalizedMapBriefInput } from "@/lib/schema";
import { GenerationMetricsCollector } from "@/lib/generation-metrics";

const callStructuredModelMock = vi.fn();

vi.mock("@/lib/openrouter", () => ({
  callStructuredModel: (...args: unknown[]) => callStructuredModelMock(...args),
}));

vi.mock("@/lib/openrouter-stream", () => ({
  callStructuredModelStreaming: vi.fn(async () => null),
}));

vi.mock("@/lib/research-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/research-engine")>();
  return {
    ...actual,
    fetchResearchContext: vi.fn(async () => ({
      groundingState: "none",
      summary: "",
      knownEntities: [],
      sources: [],
      entityHints: [],
      axisHints: [],
      constraintHints: [],
      sections: [],
    })),
  };
});

vi.mock("@/lib/serpapi-images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/serpapi-images")>();
  return {
    ...actual,
    getSerpApiKey: vi.fn(() => null),
  };
});

import { buildMapJob } from "@/lib/map-engine";

function normalizedBrief(): NormalizedMapBriefInput {
  return {
    topic: "Repair Fixture",
    combines: "axes",
    candidateDimensions: [],
    inferDimensions: true,
    audience: "Readers",
    tone: "Concrete",
    mustIncludeExamples: [],
    mustAvoid: [],
    domain: "Machines",
    topicFamily: "General",
    dimensions: [
      { key: "axis_x", label: "Axis X", description: "X" },
      { key: "axis_y", label: "Axis Y", description: "Y" },
    ],
    accepted: true,
    guidance: ["ok"],
  };
}

function skeleton(): MapSkeletonInput {
  return {
    title: "Repair Fixture Map",
    slug: "repair-fixture",
    summary: "Repair fixture summary.",
    intro: "Repair fixture intro.",
    domain: "Machines",
    topicFamily: "General",
    dimensions: [
      { key: "axis_x", label: "Axis X", description: "X", values: ["A", "B", "C"] },
      { key: "axis_y", label: "Axis Y", description: "Y", values: ["1", "2", "3"] },
    ],
    constraints: [
      {
        label: "Constraint one",
        kind: "physical",
        explanation: "Keeps some pairings apart.",
      },
      {
        label: "Constraint two",
        kind: "cultural",
        explanation: "Keeps some pairings niche.",
      },
    ],
    renderingHints: {
      accent: "#000",
      gradient: ["#000", "#111"],
    },
    seo: {
      title: "Repair Fixture Map",
      description: "Repair fixture map",
    },
  };
}

function examples(prefix: string, coordinates: Record<string, string>) {
  return [
    {
      name: `${prefix} One`,
      brand: `${prefix} Brand`,
      description: `${prefix} one fixture anchor.`,
      coordinates,
      status: "existing" as const,
    },
    {
      name: `${prefix} Two`,
      brand: `${prefix} Works`,
      description: `${prefix} two fixture anchor.`,
      coordinates,
      status: "existing" as const,
    },
  ];
}

function cell(
  id: string,
  x: string,
  y: string,
  status: MapCellsBatchInput["cells"][number]["status"],
  label: string,
  explanation: string,
): MapCellsBatchInput["cells"][number] {
  const coordinates = { axis_x: x, axis_y: y };
  return {
    id,
    coordinates,
    label,
    status,
    explanation,
    confidence: status === "existing" ? 0.86 : 0.62,
    badges: [],
    examples:
      status === "existing"
        ? examples(label, coordinates)
        : status === "rare"
          ? [examples(label, coordinates)[0]]
          : [],
  };
}

function broadBatch(includeC3 = false): MapCellsBatchInput {
  const cells = [
    cell("a1", "A", "1", "existing", "A1", "Existing cell."),
    cell("a2", "A", "2", "rare", "A2", "Rare cell."),
    cell(
      "a3",
      "A",
      "3",
      "gap",
      "A3",
      "This gap would need a more compact control package and a stronger support frame to become viable.",
    ),
    cell("b1", "B", "1", "existing", "B1", "Existing cell."),
    cell(
      "b2",
      "B",
      "2",
      "impossible",
      "B2",
      "The actuator layout is mechanically incompatible with this mounting style, so the combination cannot stabilize.",
    ),
    cell("b3", "B", "3", "existing", "B3", "Existing cell."),
    cell(
      "c1",
      "C",
      "1",
      "gap",
      "C1",
      "This gap would need a more specialized enclosure and a visibly simplified panel to hold together.",
    ),
    cell("c2", "C", "2", "existing", "C2", "Existing cell."),
  ];
  if (includeC3) {
    cells.push(cell("c3", "C", "3", "existing", "C3", "Existing cell."));
  }
  return {
    cells,
    featuredExamples: cells.flatMap((item) => item.examples).slice(0, 4),
    notableGaps: [
      {
        label: "A3",
        explanation:
          "This gap would need a more compact control package and a stronger support frame to become viable.",
        coordinates: { axis_x: "A", axis_y: "3" },
      },
    ],
    impossibleCombos: [
      {
        label: "B2",
        explanation:
          "The actuator layout is mechanically incompatible with this mounting style, so the combination cannot stabilize.",
        coordinates: { axis_x: "B", axis_y: "2" },
      },
    ],
  };
}

function repairBatch(success: boolean): MapCellsBatchInput {
  return success
    ? {
        cells: [cell("c3", "C", "3", "existing", "C3", "Existing cell.")],
        featuredExamples: examples("C3", { axis_x: "C", axis_y: "3" }),
        notableGaps: [],
        impossibleCombos: [],
      }
    : {
        cells: [],
        featuredExamples: [],
        notableGaps: [],
        impossibleCombos: [],
      };
}

describe("map engine targeted repair", () => {
  beforeEach(() => {
    callStructuredModelMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("repairs only the missing coordinates after partial batch coverage", async () => {
    callStructuredModelMock.mockImplementation(async ({ schemaName, input }: { schemaName: string; input: string }) => {
      if (schemaName === "normalized_map_brief") return normalizedBrief();
      if (schemaName === "map_skeleton") return skeleton();
      if (schemaName === "map_cells") {
        const parsed = JSON.parse(input) as { batch?: { mode?: string } };
        return parsed.batch?.mode === "repair" ? repairBatch(true) : broadBatch(false);
      }
      throw new Error(`Unexpected call for ${schemaName}`);
    });

    const collector = new GenerationMetricsCollector();
    const out = await buildMapJob(
      {
        topic: "Repair fixture",
        combines: "",
        candidateDimensions: [],
        inferDimensions: true,
        audience: "Readers",
        tone: "Concrete",
        mustIncludeExamples: [],
        mustAvoid: [],
      },
      undefined,
      collector,
    );

    expect(out.result.status).toBe("success");
    expect(out.document?.cells).toHaveLength(9);
    expect(out.document?.cells.find((cell) => cell.coordinates.axis_x === "C" && cell.coordinates.axis_y === "3")?.status).toBe("existing");
    const cellsMetric = collector.finalize().stages.find((stage) => stage.stageId === "cells_batches");
    expect(cellsMetric?.extras).toMatchObject({
      repairAttemptCount: 1,
      repairRecoveredPairCount: 1,
      unresolvedPairCount: 0,
    });
  });

  it("falls back only the unresolved coordinates when repair does not recover them", async () => {
    callStructuredModelMock.mockImplementation(async ({ schemaName, input }: { schemaName: string; input: string }) => {
      if (schemaName === "normalized_map_brief") return normalizedBrief();
      if (schemaName === "map_skeleton") return skeleton();
      if (schemaName === "map_cells") {
        const parsed = JSON.parse(input) as { batch?: { mode?: string } };
        return parsed.batch?.mode === "repair" ? repairBatch(false) : broadBatch(false);
      }
      throw new Error(`Unexpected call for ${schemaName}`);
    });

    const collector = new GenerationMetricsCollector();
    const out = await buildMapJob(
      {
        topic: "Repair fixture",
        combines: "",
        candidateDimensions: [],
        inferDimensions: true,
        audience: "Readers",
        tone: "Concrete",
        mustIncludeExamples: [],
        mustAvoid: [],
      },
      undefined,
      collector,
    );

    expect(out.result.status).toBe("success");
    const repairedCell = out.document?.cells.find(
      (cell) => cell.coordinates.axis_x === "C" && cell.coordinates.axis_y === "3",
    );
    expect(repairedCell?.badges).toContain("Matrix repair");
    expect(repairedCell?.badges).toContain("Thin evidence");
    expect(out.document?.notableGaps.map((gap) => gap.label)).not.toContain("C × 3");
    const cellsMetric = collector.finalize().stages.find((stage) => stage.stageId === "cells_batches");
    expect(cellsMetric?.extras).toMatchObject({
      repairAttemptCount: 1,
      unresolvedPairCount: 1,
    });
  });
});
