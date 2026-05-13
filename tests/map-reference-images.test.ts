import { describe, expect, it, vi, beforeEach } from "vitest";
import { enrichMapDocumentReferenceImages, exampleIdentityKey } from "@/lib/map-reference-images";
import * as serp from "@/lib/serpapi-images";
import type { MapDocument, MapExample } from "@/lib/types";
import { testBreadMapDocument } from "./fixtures/bread-map-document";

vi.mock("@/lib/serpapi-images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/serpapi-images")>();
  return {
    ...actual,
    getSerpApiKey: vi.fn(() => "test-key"),
    fetchGoogleImageExampleResults: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(serp.getSerpApiKey).mockReturnValue("test-key");
});

describe("exampleIdentityKey", () => {
  it("normalizes casing", () => {
    expect(exampleIdentityKey({ name: "Foo", brand: "Bar", year: "1999" })).toBe(
      exampleIdentityKey({ name: "foo", brand: "bar", year: "1999" }),
    );
  });
});

describe("enrichMapDocumentReferenceImages", () => {
  it("merges persisted thumbnails onto examples (mocked Serp)", async () => {
    vi.mocked(serp.fetchGoogleImageExampleResults).mockResolvedValue({
      results: [{ link: "https://example.com/full", thumbnail: "https://example.com/thumb.jpg", title: "x", source: "y" }],
    });

    const doc = testBreadMapDocument;
    const out = await enrichMapDocumentReferenceImages(doc);

    expect(serp.fetchGoogleImageExampleResults).toHaveBeenCalled();
    const withRefs = out.cells.flatMap((c) => c.examples).filter((e) => e.referenceImages?.length);
    expect(withRefs.length).toBeGreaterThan(0);
    expect(withRefs[0]?.referenceImages?.[0]).toMatchObject({
      link: "https://example.com/full",
      thumbnail: "https://example.com/thumb.jpg",
    });
  });

  it("skips when no API key", async () => {
    vi.mocked(serp.getSerpApiKey).mockReturnValue(null);
    const doc = testBreadMapDocument;
    const out = await enrichMapDocumentReferenceImages(doc);
    expect(serp.fetchGoogleImageExampleResults).not.toHaveBeenCalled();
    expect(out).toBe(doc);
  });

  it("dedupes by identity: same example in two cells uses one Serp call", async () => {
    const ex: MapExample = {
      name: "Shared Anchor",
      description: "y".repeat(50),
      coordinates: { ax: "u", ay: "v" },
      status: "existing",
      brand: "BrandX",
      evidenceNote: "Long enough note for policy.",
    };
    const cellBase = {
      label: "L",
      status: "existing" as const,
      explanation: "Cell explanation with enough characters.",
      confidence: 0.9,
      badges: [] as string[],
    };
    const doc = {
      title: "t",
      slug: "dedupe",
      summary: "s",
      intro: "i",
      domain: "d",
      topicFamily: "f",
      dimensions: [
        { key: "ax", label: "AX", description: "d", values: ["a", "b"] },
        { key: "ay", label: "AY", description: "d", values: ["c", "d"] },
      ],
      cells: [
        {
          id: "c1",
          coordinates: { ax: "a", ay: "c" },
          ...cellBase,
          examples: [{ ...ex, coordinates: { ax: "a", ay: "c" } }],
        },
        {
          id: "c2",
          coordinates: { ax: "b", ay: "c" },
          ...cellBase,
          examples: [{ ...ex, coordinates: { ax: "b", ay: "c" } }],
        },
      ],
      featuredExamples: [],
      notableGaps: [{ label: "g", explanation: "e", coordinates: { ax: "a", ay: "c" } }],
      impossibleCombos: [{ label: "i", explanation: "e", coordinates: { ax: "a", ay: "d" } }],
      constraints: [
        { label: "c1", kind: "physical" as const, explanation: "e1" },
        { label: "c2", kind: "cultural" as const, explanation: "e2" },
      ],
      renderingHints: { accent: "#000", gradient: ["#000", "#fff"] as [string, string] },
      seo: { title: "t", description: "d" },
    } satisfies MapDocument;

    vi.mocked(serp.fetchGoogleImageExampleResults).mockResolvedValue({
      results: [{ link: "https://x/l", thumbnail: "https://x/t", title: "", source: "" }],
    });

    await enrichMapDocumentReferenceImages(doc);
    expect(vi.mocked(serp.fetchGoogleImageExampleResults).mock.calls.length).toBe(1);
  });

  it("never issues more concurrent Serp fetches than the enrichment cap", async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    vi.mocked(serp.fetchGoogleImageExampleResults).mockImplementation(async () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise<void>((resolve) => {
        queueMicrotask(() => resolve());
      });
      inFlight--;
      return { results: [{ link: `https://x/${peakInFlight}`, thumbnail: `https://t/${peakInFlight}`, title: "", source: "" }] };
    });

    const cellProto = {
      label: "L",
      status: "existing" as const,
      explanation: "Enough text for moderation and policy checks on the cell itself.",
      confidence: 0.9,
      badges: [] as string[],
    };

    const examples = Array.from({ length: 8 }, (_, i) => ({
      name: `Item ${i}`,
      description: "y".repeat(50),
      coordinates: { ax: String(i % 3), ay: String(i % 2) },
      status: "existing" as const,
    }));

    const doc = {
      title: "t",
      slug: "conc",
      summary: "s",
      intro: "i",
      domain: "d",
      topicFamily: "f",
      dimensions: [
        { key: "ax", label: "AX", description: "d", values: ["0", "1", "2"] },
        { key: "ay", label: "AY", description: "d", values: ["0", "1"] },
      ],
      featuredExamples: examples.slice(0, 4),
      cells: [
        {
          id: "c1",
          coordinates: { ax: "0", ay: "0" },
          ...cellProto,
          examples: examples.slice(4, 8),
        },
      ],
      notableGaps: [{ label: "g", explanation: "e", coordinates: { ax: "0", ay: "0" } }],
      impossibleCombos: [{ label: "i", explanation: "e", coordinates: { ax: "0", ay: "1" } }],
      constraints: [
        { label: "c1", kind: "physical" as const, explanation: "e1" },
        { label: "c2", kind: "cultural" as const, explanation: "e2" },
      ],
      renderingHints: { accent: "#000", gradient: ["#000", "#fff"] as [string, string] },
      seo: { title: "t", description: "d" },
    } satisfies MapDocument;

    await enrichMapDocumentReferenceImages(doc);
    expect(peakInFlight).toBeLessThanOrEqual(4);
  });

  it("memoizes by normalized query: different identities sharing the assembled query reuse one upstream fetch", async () => {
    let upstreamCalls = 0;
    vi.mocked(serp.fetchGoogleImageExampleResults).mockImplementation(async () => {
      upstreamCalls++;
      return {
        results: [{ link: "https://x/one", thumbnail: "https://t/one", title: "", source: "" }],
      };
    });

    const cellBase = {
      label: "L",
      status: "existing" as const,
      explanation: "Cell explanation with enough characters.",
      confidence: 0.9,
      badges: [] as string[],
    };

    const doc = {
      title: "t",
      slug: "memo",
      summary: "s",
      intro: "i",
      domain: "d",
      topicFamily: "f",
      dimensions: [
        { key: "ax", label: "AX", description: "d", values: ["0", "1"] },
        { key: "ay", label: "AY", description: "d", values: ["0", "1"] },
      ],
      featuredExamples: [
        {
          name: "SecondToken",
          brand: "FirstToken",
          description: "y".repeat(50),
          coordinates: { ax: "0", ay: "0" },
          status: "existing" as const,
        },
      ],
      cells: [
        {
          id: "c1",
          coordinates: { ax: "0", ay: "0" },
          ...cellBase,
          examples: [
            {
              name: "FirstToken SecondToken",
              description: "y".repeat(50),
              coordinates: { ax: "0", ay: "0" },
              status: "existing" as const,
            },
          ],
        },
      ],
      notableGaps: [{ label: "g", explanation: "e", coordinates: { ax: "0", ay: "0" } }],
      impossibleCombos: [{ label: "i", explanation: "e", coordinates: { ax: "0", ay: "1" } }],
      constraints: [
        { label: "c1", kind: "physical" as const, explanation: "e1" },
        { label: "c2", kind: "cultural" as const, explanation: "e2" },
      ],
      renderingHints: { accent: "#000", gradient: ["#000", "#fff"] as [string, string] },
      seo: { title: "t", description: "d" },
    } satisfies MapDocument;

    vi.mocked(serp.getSerpApiKey).mockReturnValue("test-key");
    vi.mocked(serp.fetchGoogleImageExampleResults).mockClear();

    await enrichMapDocumentReferenceImages(doc);

    expect(upstreamCalls).toBe(1);
  });
});
