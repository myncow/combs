import type { GenerationMetrics } from "@/lib/generation-metrics";

export const MAP_CELL_STATUSES = ["existing", "rare", "gap", "tension", "impossible"] as const;
export const MAP_VISIBILITY = ["published", "failed", "generating"] as const;
export const MAP_VISUAL_SERIES_PRESETS = [
  "natural-history-plate",
  "editorial-habitat-photo",
  "studio-product",
  "documentary-context",
  "macro-detail",
  "tactile-diorama",
] as const;
export const LEADERBOARD_SORTS = ["top", "new"] as const;
export const LEADERBOARD_VOTE_DIRECTIONS = ["up", "down"] as const;
export const NAVIGATION_LOCATIONS = ["header_primary", "footer_primary", "footer_legal"] as const;
export const PAGE_STATUSES = ["draft", "published", "archived"] as const;
export const PAGE_TEMPLATES = ["home", "listing"] as const;

export type MapCellStatus = (typeof MAP_CELL_STATUSES)[number];
export type MapVisibility = (typeof MAP_VISIBILITY)[number];
export type MapVisualSeriesPresetId = (typeof MAP_VISUAL_SERIES_PRESETS)[number];
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];
export type LeaderboardVoteDirection = (typeof LEADERBOARD_VOTE_DIRECTIONS)[number];
export type NavigationLocation = (typeof NAVIGATION_LOCATIONS)[number];
export type PageStatus = (typeof PAGE_STATUSES)[number];
export type PageTemplate = (typeof PAGE_TEMPLATES)[number];

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
  /** OpenRouter image model slug used for this render (newer maps only). */
  imageModel?: string;
  /** Full text prompt sent to the image model — surfaced in the cell drawer. */
  prompt?: string;
  /**
   * SHA-256 of the persisted image bytes (hex). Used for cross-cell
   * duplicate detection: when two visualizations share a byte-identical
   * hash, the model reused an output and the cell should be regenerated
   * with a diversification cue. Optional so legacy rows pre-dating this
   * field continue to load.
   */
  byteHash?: string;
}

export interface GapSpotlightDraft {
  mapSlug: string;
  cellId: string;
  storyTitle: string;
  storySummary: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  id: string;
  slug: string;
  mapId: string;
  mapSlug: string;
  mapTitle: string;
  topicFamily: string;
  cellId: string;
  cellLabel: string;
  coordinatesSnapshot: Record<string, string>;
  imageUrl: string;
  storyTitle: string;
  storySummary: string;
  publishedAt: string;
  createdAt: string;
  score: number;
  upvotes: number;
  downvotes: number;
}

export interface ListedLeaderboardEntry extends LeaderboardEntry {
  viewerVote?: LeaderboardVoteDirection | null;
}

export interface LeaderboardVote {
  entryId: string;
  requesterId: string;
  direction: LeaderboardVoteDirection;
  createdAt: string;
  updatedAt: string;
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
    /**
     * True while the document is the synthetic fallback scaffold that
     * `runMapGenerationCore` writes before the real skeleton arrives. The
     * map page reads this to keep the loading skeleton up instead of
     * flashing generic placeholder axes. Cleared on the first real skeleton
     * patch. Stashed inside `renderingHints` because that is the only
     * JSONB column already persisted in `applyMapPatch`.
     */
    scaffold?: boolean;
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
  updatedAt: string;
  summary: string;
  promptSummary: string;
  document: MapDocument;
  /** Monotonic counter bumped each time the document is mutated server-side. */
  revision?: number;
  /** Whether this map is visible to anyone (gallery) vs. owner-only by default. */
  isPublic?: boolean;
  /** Neon Auth user id of the map's creator. May be null on legacy rows. */
  createdByNeonUserId?: string | null;
  /**
   * Resolved display name (or email fallback) for the creator. Populated by
   * `listMaps` / `getMapBySlug` via a batched lookup against `neon_auth.user`.
   * `null` for unowned legacy/seed rows.
   */
  createdByDisplayName?: string | null;
  /**
   * Pre-computed representative thumbnail URL derived from the document at
   * read time by `serializeSavedMap`. `null` when the document has no
   * persisted imagery yet (callers render a synthetic placeholder).
   * Keep optional so stored rows that pre-date this field stay compatible.
   */
  thumbnailUrl?: string | null;
}

export interface SiteSettings {
  id: string;
  appName: string;
  defaultSeoTitle: string;
  defaultSeoDescription: string;
  metadataTitleTemplate: string;
  openGraphTitle: string;
  openGraphDescription: string;
  footerCopy: string;
  supportEmail?: string | null;
  contactUrl?: string | null;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface NavigationLink {
  id: string;
  location: NavigationLocation;
  label: string;
  href: string;
  sortOrder: number;
  isEnabled: boolean;
}

export interface HomePageContent {
  key: "home";
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  heroTitle: string;
  heroBody: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  sectionEyebrow: string;
  sectionTitle: string;
  sectionSummary: string;
}

export interface ListingPageContent {
  key: "gallery" | "leaderboard";
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  heading: string;
  intro: string;
  helperText: string;
  emptyStateTitle: string;
  emptyStateBody: string;
}

export type PageContent = HomePageContent | ListingPageContent;

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

export interface CellVisualizationRun {
  id: string;
  mapId?: string | null;
  /** The cell's `cellKey` value used to resolve the DB row id. */
  cellKey?: string | null;
  imageModel: string;
  imageGenerationCalls: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  wallTimeMsTotal?: number | null;
  createdAt: string;
}
