import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const buildMapJobMock = vi.fn();
const saveMapMock = vi.fn();
const logGenerationRunMock = vi.fn();
const applyMapPatchMock = vi.fn();
const getDbMock = vi.fn();
const updateMock = vi.fn();
const setMock = vi.fn();
const whereMock = vi.fn();

vi.mock("@/lib/map-engine", () => ({
  buildMapJob: (...args: unknown[]) => buildMapJobMock(...args),
}));

vi.mock("@/lib/store", () => ({
  applyMapPatch: (...args: unknown[]) => applyMapPatchMock(...args),
  saveMap: (...args: unknown[]) => saveMapMock(...args),
  logGenerationRun: (...args: unknown[]) => logGenerationRunMock(...args),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: (...args: unknown[]) => getDbMock(...args),
}));

vi.mock("@/lib/db/schema", () => ({
  mapsTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => args,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import type { NormalizedMapBrief, MapDocument } from "@/lib/types";
import { runMapGenerationCore } from "@/lib/map-generation-runner";

describe("runMapGenerationCore", () => {
  // The runner now fails fast when OPENROUTER_API_KEY is missing so
  // operators get a clear "set this env var" message instead of the generic
  // "brief normalization unavailable". Set it for the mocked happy-path
  // tests below; the missing-key path has its own dedicated test.
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    buildMapJobMock.mockReset();
    saveMapMock.mockReset();
    logGenerationRunMock.mockReset();
    applyMapPatchMock.mockReset();
    getDbMock.mockReset();
    updateMock.mockReset();
    setMock.mockReset();
    whereMock.mockReset();
    applyMapPatchMock.mockResolvedValue({ revision: 1 });

    getDbMock.mockReturnValue({ update: updateMock });
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
    vi.clearAllMocks();
  });

  it("returns a clear configuration error when OPENROUTER_API_KEY is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const brief = {
      topic: "x",
      combines: "",
      candidateDimensions: [],
      inferDimensions: false,
      audience: "",
      tone: "",
      mustIncludeExamples: [],
      mustAvoid: [],
    };

    const out = await runMapGenerationCore(brief);

    expect(out.outcome).toBe("error");
    if (out.outcome === "error") {
      expect(out.message).toContain("OPENROUTER_API_KEY");
    }
    expect(buildMapJobMock).not.toHaveBeenCalled();
    expect(saveMapMock).not.toHaveBeenCalled();
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

  it("marks a reserved map failed when grounded generation is unavailable", async () => {
    const brief = { topic: "x", combines: "", candidateDimensions: [], inferDimensions: false, audience: "", tone: "", mustIncludeExamples: [], mustAvoid: [] };
    const normalizedBrief = {
      ...brief,
      domain: "d",
      topicFamily: "t",
      dimensions: [
        { key: "a", label: "A", description: "" },
        { key: "b", label: "B", description: "" },
      ],
      accepted: true,
      guidance: [],
    } satisfies NormalizedMapBrief;

    buildMapJobMock.mockResolvedValue({
      result: {
        status: "failed",
        error: "Grounded generation unavailable.",
        guidance: ["Grounded generation unavailable; try again when model access is configured."],
      },
      normalizedBrief,
      document: null,
    });

    const out = await runMapGenerationCore(brief, {
      reservedMap: { id: "map_reserved", slug: "reserved-slug" },
    });

    expect(out.outcome).toBe("failed_publish");
    expect(applyMapPatchMock).toHaveBeenCalledTimes(1);
    expect(applyMapPatchMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        mapId: "map_reserved",
        status: "failed",
      }),
    );
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        summary: "Grounded generation unavailable.",
      }),
    );
    expect(logGenerationRunMock).toHaveBeenCalledTimes(1);
  });
});
