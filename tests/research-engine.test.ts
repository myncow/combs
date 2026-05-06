import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchResearchContext } from "@/lib/research-engine";

function researchResponse(content: string, sources: string[] = []) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content,
            annotations: sources.map((url, index) => ({
              type: "url_citation",
              url_citation: {
                url,
                title: `Source ${index + 1}`,
              },
            })),
          },
        },
      ],
    }),
    { status: 200 },
  );
}

describe("research engine grounding", () => {
  const fetch0 = global.fetch;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "stub";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = fetch0;
  });

  it("does not broadcast top-level sources into every entity citation list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          researchResponse(
            "AXES:\n- Axis: Form | Values: Upright, Spreading | Why: Visible separation",
            ["https://example.com/taxonomy"],
          ),
        )
        .mockResolvedValueOnce(
          researchResponse(
            "REAL EXAMPLES:\n- Example One | Maker A | Upright | Named evidence",
            ["https://example.com/examples"],
          ),
        )
        .mockResolvedValueOnce(
          researchResponse(
            "CONSTRAINTS:\n- Constraint | physical | keeps some crossings rare\nEDGE CASES:\n- Edge Case | why it is rare",
            ["https://example.com/constraints"],
          ),
        )
        .mockResolvedValueOnce(
          researchResponse(
            "VISUAL ANCHORS:\n- Name: Example One | Silhouette: Tall oval | Materials: glazed ceramic | Scale: handheld | Color: blue-white | Era: modern",
            ["https://example.com/visuals"],
          ),
        ),
    );

    const research = await fetchResearchContext({
      topic: "Ceramic vessels",
      combines: "",
      domain: "Ceramic vessels",
      topicFamily: "General",
      dimensions: [],
      mustIncludeExamples: [],
      mustAvoid: [],
    });

    expect(research.groundingState).toBe("sourced");
    expect(research.sources.length).toBeGreaterThan(0);
    expect(research.entityHints[0]?.name).toBe("Example One");
    expect(research.entityHints[0]?.citations ?? []).toEqual([]);
  });

  it("marks citation-free research as unsourced", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        researchResponse(
          "AXES:\n- Axis: Form | Values: Upright, Spreading | Why: Visible separation",
        ),
      ),
    );

    const research = await fetchResearchContext({
      topic: "Ceramic vessels",
      combines: "",
      domain: "Ceramic vessels",
      topicFamily: "General",
      dimensions: [],
      mustIncludeExamples: [],
      mustAvoid: [],
    });

    expect(research.groundingState).toBe("unsourced");
    expect(research.sources).toEqual([]);
    expect(research.summary.length).toBeGreaterThan(0);
  });
});
