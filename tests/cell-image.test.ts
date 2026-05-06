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

const eggHamCell: MapCell = {
  id: "orange-yolk-mahogany-ham",
  coordinates: {
    "yolk-chroma": "Sunset Orange",
    "meat-pigmentation": "Mahogany",
  },
  label: "Sunset yolk with mahogany ham",
  status: "gap",
  explanation: "A dramatic breakfast plate crossing bright yolk color with dark cured ham.",
  confidence: 0.58,
  badges: ["Opportunity"],
  examples: [],
};

const eggHamDocument: MapDocument = {
  title: "Egg and Ham Visual Palette Map",
  slug: "egg-ham-map",
  summary: "A map of plated eggs and ham across yolk color and meat pigmentation.",
  intro: "Each cell should show the egg/yolk and ham/meat together as one plated subject.",
  domain: "Eggs and ham",
  topicFamily: "Food & Drink",
  dimensions: [
    {
      key: "yolk-chroma",
      label: "Yolk chroma",
      description: "The visible color intensity of the egg yolk.",
      values: ["Pale Cream", "Sunset Orange", "Deep Crimson"],
    },
    {
      key: "meat-pigmentation",
      label: "Meat pigmentation",
      description: "The visible color and opacity of the ham or cured meat.",
      values: ["Translucent Pale Pink", "Mahogany"],
    },
  ],
  cellSchema: {
    primaryX: "yolk-chroma",
    primaryY: "meat-pigmentation",
  },
  cells: [
    eggHamCell,
    {
      id: "pale-yolk-mahogany-ham",
      coordinates: {
        "yolk-chroma": "Pale Cream",
        "meat-pigmentation": "Mahogany",
      },
      label: "Pale yolk with mahogany ham",
      status: "rare",
      explanation: "A documented plate where both egg yolk and ham color are visible.",
      confidence: 0.82,
      badges: ["Known"],
      examples: [
        {
          name: "Breakfast plate with dark ham and pale egg",
          description: "A plated egg with visible pale yolk next to dark cured ham.",
          coordinates: {
            "yolk-chroma": "Pale Cream",
            "meat-pigmentation": "Mahogany",
          },
          status: "rare",
          evidenceNote: "Both the egg yolk and ham surface are visible in the same plate.",
          referenceImages: [
            {
              link: "https://example.com/egg-ham-plate.jpg",
              thumbnail: "https://example.com/egg-ham-plate-thumb.jpg",
              title: "Egg and dark ham plate",
              source: "Kitchen Archive",
            },
          ],
        },
      ],
    },
  ],
  featuredExamples: [],
  notableGaps: [
    {
      label: "Sunset yolk with mahogany ham",
      explanation: "A visually plausible but underused crossing.",
      coordinates: eggHamCell.coordinates,
    },
  ],
  impossibleCombos: [],
  constraints: [],
  renderingHints: {
    accent: "#c2410c",
    gradient: ["#fed7aa", "#7f1d1d"],
  },
  seo: {
    title: "Egg and Ham Visual Palette Map | Raster",
    description: "Explore egg and ham color combinations.",
  },
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
    expect(prompt).toContain("Photorealism mandate");
    expect(prompt).toContain("Photorealistic field-guide specimen photography");
    expect(prompt).toContain("## Exact subject lock");
    expect(prompt).toContain("The image must be a Birds subject");
    expect(prompt).toContain("The primary subject should fill roughly 60-80% of the frame.");
    expect(prompt).toContain("Favor a strong silhouette");
    expect(prompt).toContain("strong image when reduced to a small tile");
    expect(prompt).toContain("Avoid sterile studio-backdrop language and retail presentation tropes.");
    expect(prompt).toContain("Do not illustrate absence, impossibility, tension");
    expect(prompt).toContain("Unrelated output is a failure");
    expect(prompt).toContain("Use other visual examples as the main source of truth");
    expect(prompt).toContain("## Plausibility construction");
    expect(prompt).toContain("Persisted visual references available to you");
    expect(prompt).toContain("Ref 1: Direct evidence from Virginia rail");
    expect(prompt).toContain("Red-winged blackbird");
    expect(prompt).toContain("#0f766e");
    expect(prompt).toContain("Generate a single square image for this map cell");
    expect(prompt).toContain("## Composition hint");
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

    expect(tensionPrompt).toContain("hard-but-viable edge case");
    expect(tensionPrompt).toContain("do not dramatize tension");
    expect(impossiblePrompt).toContain("stay in-domain");
    expect(impossiblePrompt).toContain("minimum visible assumptions");
    expect(impossiblePrompt).toContain("Silently choose one or two visible assumptions");
    expect(impossiblePrompt).toContain("without changing the subject category");
    expect(impossiblePrompt).toContain("Do not show impossibility, tension, failure");
  });

  it("requires every coordinate carrier for composite subjects", () => {
    const prompt = buildCellImagePrompt(eggHamDocument, eggHamCell, false);

    expect(prompt).toContain("Composite subjects must remain complete");
    expect(prompt).toContain("an eggs-and-ham cell must show the egg/yolk and the ham/meat");
    expect(prompt).toContain("## Coordinate coverage checklist");
    expect(prompt).toContain('Yolk chroma = Sunset Orange: the visible carrier of "Yolk chroma" must appear');
    expect(prompt).toContain('Meat pigmentation = Mahogany: the visible carrier of "Meat pigmentation" must appear');
    expect(prompt).toContain("Do not crop out, hide, imply, substitute, or leave off any coordinate carrier");
    expect(prompt).toContain("Show every coordinate-bearing object, ingredient, part, or material");
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

  it("calls Seedream once and stores the cell label as caption", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              images: [{ image_url: { url: "https://img.local/seedream.png" } }],
            },
          },
        ],
      }),
    );

    global.fetch = fetchMock as typeof global.fetch;

    const result = await generateCellVisualizationImage(groundedBirdDocument, birdCell);

    expect(result?.imageUrl).toBe("https://img.local/seedream.png");
    expect(result?.caption).toBe("Wetland waders");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("bytedance-seed/seedream-4.5");
    expect(body.modalities).toEqual(["image"]);
  });

  it("forwards an allowlisted image model when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              images: [{ image_url: { url: "https://img.local/flux.png" } }],
            },
          },
        ],
      }),
    );

    global.fetch = fetchMock as typeof global.fetch;

    const result = await generateCellVisualizationImage(groundedBirdDocument, birdCell, {
      imageModel: "black-forest-labs/flux.2-max",
    });

    expect(result?.imageUrl).toBe("https://img.local/flux.png");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("black-forest-labs/flux.2-max");
    expect(body.modalities).toEqual(["image"]);
  });

  it("falls back to Seedream when image model is not allowlisted", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              images: [{ image_url: { url: "https://img.local/fallback.png" } }],
            },
          },
        ],
      }),
    );

    global.fetch = fetchMock as typeof global.fetch;

    const result = await generateCellVisualizationImage(groundedBirdDocument, birdCell, {
      imageModel: "some/unknown-image-model",
    });

    expect(result?.imageUrl).toBe("https://img.local/fallback.png");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("bytedance-seed/seedream-4.5");
    expect(body.modalities).toEqual(["image"]);
  });
});

describe("OpenRouter image modalities by model family", () => {
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

  it("uses image+text for Gemini image models (OpenRouter requirement)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              images: [{ type: "image_url", image_url: { url: "https://img.local/gemini.png" } }],
            },
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof global.fetch;

    await generateCellVisualizationImage(groundedBirdDocument, birdCell, {
      imageModel: "google/gemini-3.1-flash-image-preview",
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body));
    expect(body.modalities).toEqual(["image", "text"]);
  });

  it("uses image+text for OpenAI image models", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              images: [{ image_url: { url: "data:image/png;base64,AAA" } }],
            },
          },
        ],
      }),
    );
    global.fetch = fetchMock as typeof global.fetch;

    await generateCellVisualizationImage(groundedBirdDocument, birdCell, {
      imageModel: "openai/gpt-5.4-image-2",
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body));
    expect(body.modalities).toEqual(["image", "text"]);
  });
});
