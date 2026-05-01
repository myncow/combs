import type { GenerationMetrics } from "@/lib/generation-metrics";

export const MAP_CELL_STATUSES = ["existing", "rare", "gap", "tension", "impossible"] as const;
export const MAP_VISIBILITY = ["published", "internal", "failed"] as const;
export const MAP_VISUAL_SERIES_PRESETS = [
  "natural-history-plate",
  "editorial-habitat-photo",
  "tactile-diorama",
] as const;

export type MapCellStatus = (typeof MAP_CELL_STATUSES)[number];
export type MapVisibility = (typeof MAP_VISIBILITY)[number];
export type MapVisualSeriesPresetId = (typeof MAP_VISUAL_SERIES_PRESETS)[number];

export interface MapVisualStyleSpec {
  medium: string;
  composition: string;
  background: string;
  lighting: string;
  palette: string;
  surfaceFeel: string;
  negativePrompts: string[];
  accentHex?: string;
  gradientHexes?: string[];
}

export interface MapBrief {
  topic: string;
  combines: string;
  candidateDimensions: string[];
  inferDimensions: boolean;
  audience: string;
  tone: string;
  constraints?: string;
  mustIncludeExamples: string[];
  mustAvoid: string[];
  extraContext?: string;
}

export interface NormalizedMapBrief extends MapBrief {
  domain: string;
  topicFamily: string;
  dimensions: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  accepted: boolean;
  guidance: string[];
}

export interface MapConstraint {
  label: string;
  kind: "physical" | "cultural" | "economic" | "taste" | "taxonomy";
  explanation: string;
}

/** SERP Google Images hits persisted at generation time (optional on older maps). */
export interface MapReferenceImage {
  link: string;
  thumbnail?: string;
  title?: string;
  source?: string;
}

export interface MapExample {
  name: string;
  description: string;
  coordinates: Record<string, string>;
  status: MapCellStatus;
  brand?: string;
  year?: string;
  evidenceNote?: string;
  confidence?: number;
  /** Filled by server during map generation; map page never calls SerpApi. */
  referenceImages?: MapReferenceImage[];
}

export interface MapCell {
  id: string;
  coordinates: Record<string, string>;
  label: string;
  status: MapCellStatus;
  explanation: string;
  confidence: number;
  badges: string[];
  examples: MapExample[];
  /** Persisted cell visualization (image URL + caption) after user runs Visualize */
  visualization?: MapCellVisualization;
}

export interface MapCellVisualization {
  imageUrl: string;
  caption?: string;
  /** Optional so older persisted visualizations without timestamps still render. */
  updatedAt?: string;
}

/** Flattened cell viz row for cross-map indexes (e.g. `/visualizations`). */
export interface ListedCellVisualization {
  mapSlug: string;
  mapTitle: string;
  cellId: string;
  cellLabel: string;
  status: MapCellStatus;
  imageUrl: string;
  caption?: string;
  updatedAt: string;
  coordinatesSnapshot: Record<string, string>;
}

export interface MapDocument {
  title: string;
  slug: string;
  summary: string;
  intro: string;
  domain: string;
  topicFamily: string;
  dimensions: Array<{
    key: string;
    label: string;
    description: string;
    values: string[];
  }>;
  cellSchema: {
    primaryX: string;
    primaryY: string;
    secondary?: string[];
  };
  cells: MapCell[];
  featuredExamples: MapExample[];
  notableGaps: Array<{
    label: string;
    explanation: string;
    coordinates: Record<string, string>;
  }>;
  impossibleCombos: Array<{
    label: string;
    explanation: string;
    coordinates: Record<string, string>;
  }>;
  constraints: MapConstraint[];
  renderingHints: {
    accent: string;
    gradient: string[];
    icon?: string;
  };
  visualSeries?: {
    presetId: MapVisualSeriesPresetId;
    label: string;
    overview: string;
    styleSpec: MapVisualStyleSpec;
  };
  seo: {
    title: string;
    description: string;
  };
}

export type MapSkeleton = Omit<MapDocument, "cells" | "featuredExamples" | "notableGaps" | "impossibleCombos">;

export interface MapCellsBatch {
  cells: MapCell[];
  featuredExamples: MapExample[];
  notableGaps: Array<{
    label: string;
    explanation: string;
    coordinates: Record<string, string>;
  }>;
  impossibleCombos: Array<{
    label: string;
    explanation: string;
    coordinates: Record<string, string>;
  }>;
}

export interface GenerationJobResult {
  status: "success" | "rejected" | "failed";
  slug?: string;
  mapId?: string;
  guidance?: string[];
  error?: string;
}

export interface SavedMap {
  id: string;
  slug: string;
  title: string;
  domain: string;
  topicFamily: string;
  status: MapVisibility;
  publishedAt: string | null;
  createdAt: string;
  summary: string;
  promptSummary: string;
  document: MapDocument;
  /**
   * Pre-computed representative thumbnail URL derived from the document at
   * read time by `serializeSavedMap`. `null` when the document has no
   * persisted imagery yet (callers render a synthetic placeholder).
   * Keep optional so stored rows that pre-date this field stay compatible.
   */
  thumbnailUrl?: string | null;
}

export interface ExamplePrompt {
  id: string;
  title: string;
  topicFamily: string;
  prompt: string;
  whyItWorks: string;
  traits?: [string, string, string];
}

export interface GenerationRun {
  id: string;
  mapId?: string;
  status: "success" | "rejected" | "failed";
  model: string;
  fallbackModel?: string;
  normalizedBrief: NormalizedMapBrief | null;
  inputBrief: MapBrief;
  error?: string;
  metrics?: GenerationMetrics | null;
  createdAt: string;
}
