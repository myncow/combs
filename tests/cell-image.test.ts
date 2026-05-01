import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCellImagePrompt, generateCellVisualizationImage } from "@/lib/cell-image";
import { buildCellVisualGroundingBundle } from "@/lib/cell-visual-grounding";
import { cleanCaption, finalizeVisualizationCaption } from "@/lib/visualization-caption";
import { attachVisualSeries, resolveMapVisualSeries } from "@/lib/visual-series";
import type { MapCell, MapDocument } from "@/lib/types";

const birdDocument: MapDocument = {
  title: "Bird Map",
  slug: "bird-map",
  summary: "A map of birds across habitat moisture and feeding behavior.",
  intro: "This map compares birds by where they forage and how they move through space.",
  domain: "Birds",
  topicFamily: "Natural Science",
  dimensions: [
    {
      key: "habitat",
      label: "Habitat",
      description: "Primary habitat type.",
      values: ["Wetland", "Woodland", "Grassland"],
    },
    {
      key: "behavior",
      label: "Behavior",
      description: "Dominant feeding or movement behavior.",
      values: ["Wading", "Perching", "Soaring"],
    },
  ],
  cellSchema: {
    primaryX: "habitat",
    primaryY: "behavior",
  },
  cells: [],
  featuredExamples: [],
  notableGaps: [
    {
      label: "Wetland soaring birds",
      explanation: "A thinly populated crossing.",
      coordinates: { habitat: "Wetland", behavior: "Soaring" },
    },
  ],
  impossibleCombos: [
    {
      label: "Forest drift swimmers",
      explanation: "A blocked crossing.",
      coordinates: { habitat: "Woodland", behavior: "Wading" },
    },
  ],
  constraints: [
    {
      label: "Biome fit",
      kind: "physical",
      explanation: "The habitat has to support the body plan and behavior.",
    },
    {
      label: "Food access",
      kind: "taxonomy",
      explanation: "Feeding strategies depend on the available substrate and prey.",
    },
  ],
  renderingHints: {
    accent: "#0f766e",
    gradient: ["#ccfbf1", "#99f6e4"],
  },
  seo: {
    title: "Bird Map | Lattice",
    description: "Explore a bird map.",
  },
};

const birdCell: MapCell = {
  id: "wetland-wading",
  coordinates: {
    habitat: "Wetland",
    behavior: "Wading",
  },
  label: "Wetland waders",
  status: "gap",
  explanation: "A plausible but underfilled crossing for reed-line birds with long toes and patient movement.",
  confidence: 0.62,
  badges: ["Opportunity"],
  examples: [
    {
      name: "Virginia rail",
      description: "A marsh bird that threads through reeds at the waterline.",
      coordinates: {
        habitat: "Wetland",
        behavior: "Wading",
      },
      status: "rare",
      evidenceNote: "Often hidden in reeds rather than presented in broad open water scenes.",
      referenceImages: [
        {
          link: "https://example.com/virginia-rail.jpg",
          thumbnail: "https://example.com/virginia-rail-thumb.jpg",
          title: "Virginia rail in reeds",
          source: "Field Guide",
        },
      ],
    },
  ],
};

const groundedBirdDocument: MapDocument = {
  ...birdDocument,
  cells: [
    birdCell,
    {
      id: "wetland-perching",
      coordinates: {
        habitat: "Wetland",
        behavior: "Perching",
      },
      label: "Wetland perchers",
      status: "existing",
      explanation: "Documented marsh-edge perchers.",
      confidence: 0.9,
      badges: ["Known"],
      examples: [
        {
          name: "Red-winged blackbird",
          description: "Reed-top posture with strong wetland context and upright silhouette.",
          coordinates: {
            habitat: "Wetland",
            behavior: "Perching",
          },
          status: "existing",
          evidenceNote: "Frequently shown gripping reed stems above marsh water.",
          referenceImages: [
            {
              link: "https://example.com/red-winged-blackbird.jpg",
              thumbnail: "https://example.com/red-winged-blackbird-thumb.jpg",
              title: "Red-winged blackbird on cattails",
              source: "Cornell Lab",
            },
          ],
        },
      ],
      visualization: undefined,
    },
    {
      id: "woodland-wading",
      coordinates: {
        habitat: "Woodland",
        behavior: "Wading",
      },
      label: "Woodland waders",
      status: "rare",
      explanation: "Thin edge case around shaded creek margins.",
      confidence: 0.78,
      badges: ["Known"],
      examples: [
        {
          name: "Green heron",
          description: "Compact heron with creek-edge posture, dark crown, and patient strike stance.",
          coordinates: {
            habitat: "Woodland",
            behavior: "Wading",
          },
          status: "rare",
          evidenceNote: "Often shown in shaded riparian cover rather than open marshes.",
          referenceImages: [
            {
              link: "https://example.com/green-heron.jpg",
              thumbnail: "https://example.com/green-heron-thumb.jpg",
              title: "Green heron at wooded creek",
              source: "Audubon",
            },
          ],
        },
      ],
      visualization: undefined,
    },
  ],
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("cleanCaption", () => {
  it("strips a markdown-embedded data URL and keeps surrounding prose", () => {
    expect(
      cleanCaption("Here's the fish ![](data:image/png;base64,AAA=) Enjoy."),
    ).toBe("Here's the fish Enjoy.");
  });

  it("returns undefined for whitespace-only input", () => {
    expect(cleanCaption("   ")).toBeUndefined();
  });

  it("returns undefined when the input is just a data URL", () => {
    expect(cleanCaption("data:image/png;base64,AAA=")).toBeUndefined();
  });

  it("strips markdown code fences and image_url json fragments", () => {
    const raw = "```json\n{\"image_url\": {\"url\": \"data:image/png;base64,ZZZ=\"}}\n```\nTuna portrait.";
    expect(cleanCaption(raw)).toBe("Tuna portrait.");
  });

  it("rejects all-caps non-human garbage", () => {
    expect(cleanCaption("FRACTURED TUNA IMG_URL BASE64")).toBeUndefined();
  });

  it("passes through normal captions unchanged (trimmed)", () => {
    expect(cleanCaption("  A pentamerous peloric bloom.  ")).toBe(
      "A pentamerous peloric bloom.",
    );
  });
});

describe("cell image prompting", () => {
  it("chooses a natural-history preset for bird maps", () => {
    const series = resolveMapVisualSeries(birdDocument);
    expect(series.presetId).toBe("natural-history-plate");
    expect(series.label).toBe("Natural History Plate");
  });

  it("builds prompts around a shared series style and grounded frontier evidence", () => {
    const prompt = buildCellImagePrompt(groundedBirdDocument, birdCell, false);
    expect(prompt).toContain("Natural History Plate");
    expect(prompt).toContain("same natural history plate series");
    expect(prompt).toContain("The primary subject should fill roughly 60-80% of the frame.");
    expect(prompt).toContain("Favor a strong silhouette");
    expect(prompt).toContain("strong image when reduced to a small tile");
    expect(prompt).toContain("Avoid sterile studio-backdrop language and retail presentation tropes.");
    expect(prompt).toContain("do not use props, restraints, vines, cages, chains, lead weights");
    expect(prompt).toContain("Persisted visual references available to you");
    expect(prompt).toContain("Ref 1: Direct evidence from Virginia rail");
    expect(prompt).toContain("Red-winged blackbird");
    expect(prompt).toContain("#0f766e");
    expect(prompt).toContain('Caption rule: use "Wetland waders"');
  });

  it("switches prompt behavior by frontier status", () => {
    const tensionPrompt = buildCellImagePrompt(
      groundedBirdDocument,
      { ...birdCell, status: "tension", label: "Wetland friction birds" },
      false,
    );
    const impossiblePrompt = buildCellImagePrompt(
      groundedBirdDocument,
      { ...birdCell, status: "impossible", label: "Wetland impossible birds" },
      false,
    );

    expect(tensionPrompt).toContain("strained hybrid or edge-case");
    expect(impossiblePrompt).toContain("structurally blocked");
    expect(impossiblePrompt).toContain("failed, incomplete, unstable, or non-cohering form");
  });

  it("builds a grounding bundle from direct examples, neighboring anchors, and reference images", () => {
    const bundle = buildCellVisualGroundingBundle(groundedBirdDocument, birdCell);

    expect(bundle.directEvidence[0]?.name).toBe("Virginia rail");
    expect(bundle.neighborEvidence.some((cue) => cue.name === "Red-winged blackbird")).toBe(true);
    expect(bundle.neighborEvidence.some((cue) => cue.name === "Green heron")).toBe(true);
    expect(bundle.referenceImages.length).toBeGreaterThanOrEqual(3);
    expect(bundle.styleSpec.accentHex).toBe("#0f766e");
  });

  it("reuses the persisted visual style spec across regenerations", () => {
    const attached = attachVisualSeries(groundedBirdDocument);
    const first = buildCellImagePrompt(attached, birdCell, false);
    const second = buildCellImagePrompt(attached, birdCell, false);

    expect(attached.visualSeries?.styleSpec).toBeDefined();
    expect(first).toContain(attached.visualSeries?.styleSpec.medium ?? "");
    expect(second).toContain(attached.visualSeries?.styleSpec.medium ?? "");
  });

  it("uses the cell label for frontier captions", () => {
    expect(finalizeVisualizationCaption("Virginia rail concept", birdCell)).toBe("Wetland waders");

    const impossibleCell: MapCell = {
      ...birdCell,
      status: "impossible",
      label: "Large-Scale Aquatic Diving",
    };

    expect(
      finalizeVisualizationCaption(
        "Ancient Albatross, trapped by encumbering vines and lead weights",
        impossibleCell,
      ),
    ).toBe("Large-Scale Aquatic Diving");
  });
});

describe("cell image generation integration", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("ranks candidates with the visual judge and keeps the best accepted image", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "Wetland waders", images: [{ url: "https://img.local/candidate-a.png" }] } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: JSON.stringify({
            accepted: false,
            score: 0.34,
            subjectFit: 0.45,
            seriesFit: 0.5,
            compositionFit: 0.42,
            thumbnailFit: 0.38,
            failures: ["Looks like a diagram."],
            rationale: "Too diagram-like.",
          }) } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "Wetland waders", images: [{ url: "https://img.local/candidate-b.png" }] } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: JSON.stringify({
            accepted: true,
            score: 0.91,
            subjectFit: 0.9,
            seriesFit: 0.93,
            compositionFit: 0.88,
            thumbnailFit: 0.9,
            failures: [],
            rationale: "Strong frontier exemplar.",
          }) } }],
        }),
      );

    global.fetch = fetchMock as typeof global.fetch;

    const result = await generateCellVisualizationImage(groundedBirdDocument, birdCell);

    expect(result?.imageUrl).toBe("https://img.local/candidate-b.png");
    expect(result?.caption).toBe("Wetland waders");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("repairs once when failures exist and reviewer score lands in repair band without fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "Wetland waders", images: [{ url: "https://img.local/diag-a.png" }] } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: JSON.stringify({
            accepted: false,
            score: 0.55,
            subjectFit: 0.62,
            seriesFit: 0.64,
            compositionFit: 0.61,
            thumbnailFit: 0.63,
            failures: ["Background competes slightly."],
            rationale: "Close but cluttered.",
          }) } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "Wetland waders", images: [{ url: "https://img.local/diag-b.png" }] } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: JSON.stringify({
            accepted: false,
            score: 0.72,
            subjectFit: 0.71,
            seriesFit: 0.74,
            compositionFit: 0.73,
            thumbnailFit: 0.71,
            failures: ["Slight diagram tendency."],
            rationale: "Legible subject but cramped.",
          }) } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "Wetland waders", images: [{ url: "https://img.local/repaired.png" }] } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: JSON.stringify({
            accepted: true,
            score: 0.84,
            subjectFit: 0.82,
            seriesFit: 0.86,
            compositionFit: 0.83,
            thumbnailFit: 0.81,
            failures: [],
            rationale: "Repaired into a grounded subject render.",
          }) } }],
        }),
      );

    global.fetch = fetchMock as typeof global.fetch;

    const result = await generateCellVisualizationImage(groundedBirdDocument, birdCell);

    expect(result?.imageUrl).toBe("https://img.local/repaired.png");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
