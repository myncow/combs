import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const buildMapJobMock = vi.fn();
const saveMapMock = vi.fn();
const logGenerationRunMock = vi.fn();

vi.mock("@/lib/map-engine", () => ({
  buildMapJob: (...args: unknown[]) => buildMapJobMock(...args),
}));

vi.mock("@/lib/store", () => ({
  saveMap: (...args: unknown[]) => saveMapMock(...args),
  logGenerationRun: (...args: unknown[]) => logGenerationRunMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import type { NormalizedMapBrief, MapDocument } from "@/lib/types";
import { runMapGenerationCore } from "@/lib/map-generation-runner";

describe("runMapGenerationCore", () => {
  beforeEach(() => {
    buildMapJobMock.mockReset();
    saveMapMock.mockReset();
    logGenerationRunMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("logs metrics on rejection without saving a map", async () => {
    const brief = { topic: "x", combines: "", candidateDimensions: [], inferDimensions: false, audience: "", tone: "", mustIncludeExamples: [], mustAvoid: [] };
    buildMapJobMock.mockResolvedValue({
      result: { status: "rejected", guidance: ["narrower"] },
      normalizedBrief: { ...brief, domain: "d", topicFamily: "t", dimensions: [], accepted: false, guidance: ["narrower"] },
      document: null,
    });

    const out = await runMapGenerationCore(brief);

    expect(out.outcome).toBe("rejected");
    expect(saveMapMock).not.toHaveBeenCalled();
    expect(logGenerationRunMock).toHaveBeenCalledTimes(1);
    const run = logGenerationRunMock.mock.calls[0]?.[0] as { metrics?: unknown; status: string };
    expect(run.status).toBe("rejected");
    expect(run.metrics).toMatchObject({ version: 1 });
  });

  it("persists success through saveMap and attaches metrics when publish succeeds", async () => {
    const brief = { topic: "x", combines: "", candidateDimensions: [], inferDimensions: false, audience: "", tone: "", mustIncludeExamples: [], mustAvoid: [] };
    const normalizedBrief = {
      ...brief,
      domain: "d",
      topicFamily: "t",
      dimensions: [{ key: "a", label: "A", description: "" }],
      accepted: true,
      guidance: [],
    } satisfies NormalizedMapBrief;

    const document = {
      title: "t",
      slug: "slug",
      summary: "",
      intro: "",
      domain: "d",
      topicFamily: "t",
      dimensions: normalizedBrief.dimensions.map((d) => ({ ...d, values: ["1"] })),
      cellSchema: { primaryX: "a", primaryY: "a" },
      cells: [],
      featuredExamples: [],
      notableGaps: [],
      impossibleCombos: [],
      constraints: [],
      renderingHints: { accent: "#000", gradient: ["#000", "#111"] },
      seo: { title: "t", description: "" },
    } satisfies MapDocument;

    buildMapJobMock.mockResolvedValue({
      result: { status: "success" },
      normalizedBrief,
      document,
    });

    saveMapMock.mockResolvedValue({
      id: "map_z",
      slug: "published-slug",
      title: document.title,
      domain: document.domain,
      topicFamily: document.topicFamily,
      status: "published",
      publishedAt: "2026-05-01T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
      summary: "",
      promptSummary: "",
      document,
    });

    const out = await runMapGenerationCore(brief);

    expect(out.outcome).toBe("success");
    expect(saveMapMock).toHaveBeenCalledTimes(1);
    expect(saveMapMock.mock.calls[0]?.[0].metrics).toMatchObject({ version: 1 });
    expect(logGenerationRunMock).not.toHaveBeenCalled();
  });
});
