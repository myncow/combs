import { describe, expect, it } from "vitest";
import { resolveMapVisualSeries } from "@/lib/visual-series";
import type { MapDocument } from "@/lib/types";

const baseDoc: MapDocument = {
  title: "T",
  slug: "t",
  summary: "",
  intro: "",
  domain: "",
  topicFamily: "",
  dimensions: [
    { key: "a", label: "A", description: "", values: ["x", "y"] },
    { key: "b", label: "B", description: "", values: ["x", "y"] },
  ],
  cells: [],
  featuredExamples: [],
  notableGaps: [],
  impossibleCombos: [],
  constraints: [],
  renderingHints: { accent: "#000", gradient: ["#000", "#fff"] },
  seo: { title: "", description: "" },
};

describe("resolveMapVisualSeries preset inference", () => {
  it("picks natural-history-plate for living-thing domains", () => {
    const series = resolveMapVisualSeries({ ...baseDoc, domain: "Birds", title: "Bird Map" });
    expect(series.presetId).toBe("natural-history-plate");
  });

  it("picks editorial-habitat-photo for food / drink domains", () => {
    const series = resolveMapVisualSeries({
      ...baseDoc,
      domain: "Bread",
      title: "Bread Map",
      topicFamily: "Food & Drink",
    });
    expect(series.presetId).toBe("editorial-habitat-photo");
  });

  it("picks studio-product for discrete designed objects (footwear, watches, cameras)", () => {
    const footwear = resolveMapVisualSeries({ ...baseDoc, domain: "Footwear", title: "Footwear Map" });
    expect(footwear.presetId).toBe("studio-product");

    const watches = resolveMapVisualSeries({ ...baseDoc, domain: "Watches", title: "Watch Map" });
    expect(watches.presetId).toBe("studio-product");
  });

  it("prefers studio-product over macro-detail for product domains that mention materials", () => {
    // Without reordering, "leather bag" hits MACRO_DETAIL_PATTERN before STUDIO_PRODUCT_PATTERN.
    const leatherBag = resolveMapVisualSeries({
      ...baseDoc,
      domain: "Leather goods",
      title: "Leather Bag Map",
      summary: "leather, finish, surface",
    });
    expect(leatherBag.presetId).toBe("studio-product");
  });

  it("falls back to studio-product for unrecognized domains (not tactile-diorama)", () => {
    const unknown = resolveMapVisualSeries({
      ...baseDoc,
      domain: "Concept",
      title: "Concept Map",
      topicFamily: "General",
    });
    expect(unknown.presetId).toBe("studio-product");
  });

  it("uses persisted presetId when set on the document", () => {
    const documentary = resolveMapVisualSeries({
      ...baseDoc,
      visualSeries: {
        presetId: "documentary-context",
        label: "Documentary Context",
        overview: "x",
        styleSpec: {
          medium: "m",
          composition: "c",
          background: "b",
          lighting: "l",
          palette: "p",
          surfaceFeel: "s",
          negativePrompts: ["studio backdrop"],
        },
      },
    });
    expect(documentary.presetId).toBe("documentary-context");
    expect(documentary.label).toBe("Documentary Context");
  });
});
