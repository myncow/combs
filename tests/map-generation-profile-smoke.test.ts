import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GenerationMetricsCollector } from "@/lib/generation-metrics";
import { normalizeMapBrief } from "@/lib/map-engine";

function jsonCompletion(content: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    }),
    { status: 200 },
  );
}

describe("generation profiling stub", () => {
  const fetch0 = global.fetch;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "stub";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = fetch0;
  });

  it("records normalization duration and attempt metadata with mocked OpenRouter", async () => {
    const collector = new GenerationMetricsCollector();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonCompletion({
          topic: "Stub",
          combines: "",
          candidateDimensions: [],
          inferDimensions: false,
          audience: "",
          tone: "",
          mustIncludeExamples: [],
          mustAvoid: [],
          domain: "Stub",
          topicFamily: "General",
          dimensions: [
            { key: "axis-a", label: "A", description: "d1" },
            { key: "axis-b", label: "B", description: "d2" },
          ],
          accepted: false,
          guidance: ["narrower topic"],
        }),
      ),
    );

    await normalizeMapBrief(
      {
        topic: "stub-topic",
        combines: "",
        candidateDimensions: [],
        inferDimensions: false,
        audience: "Readers",
        tone: "Editorial",
        mustIncludeExamples: [],
        mustAvoid: [],
      },
      undefined,
      collector,
    );

    const parsed = collector.finalize();
    expect(parsed.stages.some((s) => s.stageId === "normalize_brief")).toBe(true);
    expect(fetch).toHaveBeenCalled();
  });
});
