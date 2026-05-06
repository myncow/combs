import { describe, expect, it } from "vitest";
import {
  buildDiversificationSuffix,
  findDuplicateCellVisualizations,
  findHashCollisionAgainstOthers,
} from "@/lib/visualization-diversity";
import type { MapCell, MapDocument } from "@/lib/types";

const baseDoc: MapDocument = {
  title: "T",
  slug: "t",
  summary: "s",
  intro: "i",
  domain: "d",
  topicFamily: "f",
  dimensions: [
    { key: "ax", label: "AX", description: "", values: ["a", "b"] },
    { key: "ay", label: "AY", description: "", values: ["c", "d"] },
  ],
  cellSchema: { primaryX: "ax", primaryY: "ay" },
  cells: [],
  featuredExamples: [],
  notableGaps: [],
  impossibleCombos: [],
  constraints: [],
  renderingHints: { accent: "", gradient: ["#000", "#fff"] },
  seo: { title: "", description: "" },
};

function cellFixture(id: string, label: string, byteHash?: string): MapCell {
  return {
    id,
    coordinates: { ax: "a", ay: "c" },
    label,
    status: "gap",
    explanation: "",
    confidence: 0.5,
    badges: [],
    examples: [],
    visualization: byteHash
      ? { imageUrl: `/fake/${id}.png`, updatedAt: "2026-01-01T00:00:00Z", byteHash }
      : undefined,
  };
}

describe("findDuplicateCellVisualizations", () => {
  it("returns groups for cells sharing a byteHash and ignores singletons / unhashed", () => {
    const doc: MapDocument = {
      ...baseDoc,
      cells: [
        cellFixture("a", "Alpha", "f".repeat(64)),
        cellFixture("b", "Beta", "f".repeat(64)),
        cellFixture("c", "Gamma", "0".repeat(64)),
        cellFixture("d", "Delta"), // no visualization
      ],
    };
    const groups = findDuplicateCellVisualizations(doc);
    expect(groups).toHaveLength(1);
    expect(groups[0].cellIds.sort()).toEqual(["a", "b"]);
  });

  it("returns [] when no duplicates exist", () => {
    const doc: MapDocument = {
      ...baseDoc,
      cells: [cellFixture("a", "Alpha", "f".repeat(64)), cellFixture("b", "Beta", "0".repeat(64))],
    };
    expect(findDuplicateCellVisualizations(doc)).toEqual([]);
  });
});

describe("findHashCollisionAgainstOthers", () => {
  it("returns the colliding cell when another cell shares the byteHash", () => {
    const doc: MapDocument = {
      ...baseDoc,
      cells: [cellFixture("a", "Alpha", "f".repeat(64)), cellFixture("b", "Beta", "f".repeat(64))],
    };
    const collide = findHashCollisionAgainstOthers(doc, "a", "f".repeat(64));
    expect(collide?.id).toBe("b");
  });

  it("ignores the source cell itself", () => {
    const doc: MapDocument = {
      ...baseDoc,
      cells: [cellFixture("a", "Alpha", "f".repeat(64))],
    };
    expect(findHashCollisionAgainstOthers(doc, "a", "f".repeat(64))).toBeNull();
  });

  it("returns null when the new hash is undefined", () => {
    const doc: MapDocument = {
      ...baseDoc,
      cells: [cellFixture("a", "Alpha", "f".repeat(64)), cellFixture("b", "Beta", "f".repeat(64))],
    };
    expect(findHashCollisionAgainstOthers(doc, "a", undefined)).toBeNull();
  });
});

describe("buildDiversificationSuffix", () => {
  it("references the colliding cell's label and coordinates", () => {
    const cell = cellFixture("xyz", "Pearlescent matte cube", "f".repeat(64));
    const suffix = buildDiversificationSuffix(cell);
    expect(suffix).toContain("Pearlescent matte cube");
    expect(suffix).toContain("ax=a");
    expect(suffix).toContain("ay=c");
    expect(suffix).toContain("Diversity remediation");
  });

  it("falls back to the cell id when label is empty", () => {
    const cell = cellFixture("fallback-id", "");
    const suffix = buildDiversificationSuffix(cell);
    expect(suffix).toContain("fallback-id");
  });
});
