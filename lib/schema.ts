import { z } from "zod";
import {
  LEADERBOARD_SORTS,
  LEADERBOARD_VOTE_DIRECTIONS,
  MAP_CELL_STATUSES,
  MAP_VISUAL_SERIES_PRESETS,
} from "@/lib/types";

export const mapBriefSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  combines: z.string().trim().max(180).default(""),
  candidateDimensions: z.array(z.string().trim().min(2).max(40)).max(4).default([]),
  inferDimensions: z.boolean().default(true),
  audience: z.string().trim().min(2).max(80).default("Curious enthusiasts"),
  tone: z.string().trim().min(2).max(80).default("Editorial and exploratory"),
  constraints: z.string().trim().max(400).optional(),
  mustIncludeExamples: z.array(z.string().trim().min(2).max(80)).max(5).default([]),
  mustAvoid: z.array(z.string().trim().min(2).max(80)).max(5).default([]),
  extraContext: z.string().trim().max(1500).optional(),
});

export const normalizedMapBriefSchema = mapBriefSchema.extend({
  domain: z.string(),
  topicFamily: z.string(),
  dimensions: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
      }),
    )
    .min(2)
    .max(2),
  accepted: z.boolean(),
  guidance: z.array(z.string()).min(1),
});

export const mapReferenceImageSchema = z.object({
  link: z.string(),
  thumbnail: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
});

export const mapExampleSchema = z.object({
  name: z.string(),
  description: z.string(),
  coordinates: z.record(z.string(), z.string()),
  status: z.enum(MAP_CELL_STATUSES),
  brand: z.string().optional(),
  year: z.string().optional(),
  evidenceNote: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  referenceImages: z.array(mapReferenceImageSchema).max(8).optional(),
});

export const mapCellVisualizationSchema = z.object({
  imageUrl: z.string().min(8),
  caption: z.string().optional(),
  updatedAt: z.string(),
  imageModel: z.string().min(1).max(160).optional(),
  prompt: z.string().max(8000).optional(),
  byteHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const mapCellSchema = z.object({
  id: z.string(),
  coordinates: z.record(z.string(), z.string()),
  label: z.string(),
  status: z.enum(MAP_CELL_STATUSES),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  badges: z.array(z.string()),
  examples: z.array(mapExampleSchema),
  visualization: mapCellVisualizationSchema.optional(),
});

export const mapConstraintSchema = z.object({
  label: z.string(),
  kind: z.enum(["physical", "cultural", "economic", "taste", "taxonomy"]),
  explanation: z.string(),
});

export const mapVisualStyleSpecSchema = z.object({
  medium: z.string(),
  composition: z.string(),
  background: z.string(),
  lighting: z.string(),
  palette: z.string(),
  surfaceFeel: z.string(),
  negativePrompts: z.array(z.string()).min(1).max(12),
  accentHex: z.string().optional(),
  gradientHexes: z.array(z.string()).min(2).max(4).optional(),
});

export const mapDocumentSchema = z.object({
  title: z.string(),
  slug: z.string(),
  summary: z.string(),
  intro: z.string(),
  domain: z.string(),
  topicFamily: z.string(),
  dimensions: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
        values: z.array(z.string()).min(3).max(8),
      }),
    )
    .min(2)
    .max(2),
  cells: z.array(mapCellSchema).min(9),
  featuredExamples: z.array(mapExampleSchema).min(2),
  notableGaps: z
    .array(
      z.object({
        label: z.string(),
        explanation: z.string(),
        coordinates: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
  impossibleCombos: z
    .array(
      z.object({
        label: z.string(),
        explanation: z.string(),
        coordinates: z.record(z.string(), z.string()),
      }),
    )
    .min(1),
  constraints: z.array(mapConstraintSchema).min(2),
  renderingHints: z.object({
    accent: z.string(),
    gradient: z.union([z.tuple([z.string(), z.string()]), z.array(z.string()).min(2).max(4)]),
    icon: z.string().optional(),
    /**
     * Stashed by `buildFallbackMapDocument` so the live map page can keep
     * the skeleton loader up until the real skeleton patch arrives.
     */
    scaffold: z.boolean().optional(),
  }),
  visualSeries: z
    .object({
      presetId: z.enum(MAP_VISUAL_SERIES_PRESETS),
      label: z.string(),
      overview: z.string(),
      styleSpec: mapVisualStyleSpecSchema,
    })
    .optional(),
  seo: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

export const cellVisualizationResultSchema = z.object({
  imageUrl: z.string().min(12),
  caption: z.string().optional(),
});

export type CellVisualizationResult = z.infer<typeof cellVisualizationResultSchema>;

export const gapSpotlightDraftSchema = z.object({
  mapSlug: z.string().trim().min(1).max(128),
  cellId: z.string().trim().min(1).max(160),
  storyTitle: z.string().trim().min(1).max(120),
  storySummary: z.string().trim().min(1).max(220),
  updatedAt: z.string(),
});

export const publishGapSpotlightSchema = gapSpotlightDraftSchema
  .pick({
    mapSlug: true,
    cellId: true,
    storyTitle: true,
    storySummary: true,
  })
  .extend({
    /**
     * Optional: flip the source map to public so anyone visiting the spotlight
     * detail link can actually open the map. Defaults to true at the API edge
     * because a private source map makes the published spotlight orphaned for
     * everyone except the owner/admin.
     */
    makePublic: z.boolean().optional(),
  });

export const leaderboardEntrySchema = z.object({
  id: z.string(),
  slug: z.string(),
  mapId: z.string(),
  mapSlug: z.string(),
  mapTitle: z.string(),
  topicFamily: z.string(),
  cellId: z.string(),
  cellLabel: z.string(),
  coordinatesSnapshot: z.record(z.string(), z.string()),
  imageUrl: z.string().min(8),
  storyTitle: z.string(),
  storySummary: z.string(),
  publishedAt: z.string(),
  createdAt: z.string(),
  score: z.number(),
  upvotes: z.number().int(),
  downvotes: z.number().int(),
});

export const leaderboardVoteSchema = z.object({
  entryId: z.string(),
  requesterId: z.string(),
  direction: z.enum(LEADERBOARD_VOTE_DIRECTIONS),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const leaderboardFiltersSchema = z.object({
  topicFamily: z.string().optional(),
  sort: z.enum(LEADERBOARD_SORTS).default("top"),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(64).default(12),
});

export const leaderboardVoteRequestSchema = z.object({
  direction: z.enum(LEADERBOARD_VOTE_DIRECTIONS).nullable(),
});

export const leaderboardVoteResultSchema = z.object({
  score: z.number(),
  upvotes: z.number().int(),
  downvotes: z.number().int(),
  viewerVote: z.enum(LEADERBOARD_VOTE_DIRECTIONS).nullable(),
});

export const mapFiltersSchema = z.object({
  topicFamily: z.string().optional(),
  status: z.enum(["all", "published", "failed", "live", "library"]).optional(),
  sort: z
    .enum(["recent", "quality", "top"])
    .default("recent")
    .transform((s): "recent" | "top" => (s === "quality" ? "recent" : s)),
  page: z.coerce.number().min(1).default(1),
  /** Sidebar and index UIs may request more rows per page than card grids. */
  pageSize: z.coerce.number().min(1).max(64).default(9),
  /**
   * Visibility scope. `mine` = signed-in user's library (default for the
   * sidebar); `public` = published-public maps (gallery / signed-out); `admin`
   * = every map regardless of owner/visibility (requires admin role on the
   * server route enforcing it).
   */
  scope: z.enum(["mine", "public", "admin"]).optional(),
  q: z.string().trim().max(160).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  owner: z.string().trim().max(160).optional(),
});

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => {
      if (v == null || v === "") {
        return undefined;
      }
      const s = String(v).trim();
      return s === "" ? undefined : s;
    },
    z.string().max(max).optional(),
  );

const suggestAxisDimensionSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(2).max(80),
  description: optionalTrimmed(200),
  values: z.array(z.string().trim().min(1).max(28)).min(3).max(5).default(["Low", "Middle", "High"]),
});

export const suggestAxisPairSchema = z.object({
  primary: suggestAxisDimensionSchema,
  secondary: suggestAxisDimensionSchema,
  rationale: optionalTrimmed(400),
});

export const suggestAxisPairsResponseSchema = z.object({
  pairs: z.array(suggestAxisPairSchema).min(1).max(8),
});

export type SuggestAxisPairInput = z.infer<typeof suggestAxisPairSchema>;
export type SuggestAxisPairsResponse = z.infer<typeof suggestAxisPairsResponseSchema>;

export const suggestAxisPairsRequestSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  chips: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  constraints: z.string().trim().max(400).optional(),
});

export type SuggestAxisPairsRequest = z.infer<typeof suggestAxisPairsRequestSchema>;

export type MapBriefInput = z.infer<typeof mapBriefSchema>;
export type NormalizedMapBriefInput = z.infer<typeof normalizedMapBriefSchema>;
export type MapDocumentInput = z.infer<typeof mapDocumentSchema>;
export type MapFiltersInput = z.infer<typeof mapFiltersSchema>;
export type GapSpotlightDraftInput = z.infer<typeof gapSpotlightDraftSchema>;
export type PublishGapSpotlightInput = z.infer<typeof publishGapSpotlightSchema>;
export type LeaderboardEntryInput = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardVoteInput = z.infer<typeof leaderboardVoteSchema>;
export type LeaderboardFiltersInput = z.infer<typeof leaderboardFiltersSchema>;
export type LeaderboardVoteRequestInput = z.infer<typeof leaderboardVoteRequestSchema>;
export type LeaderboardVoteResultInput = z.infer<typeof leaderboardVoteResultSchema>;

export const mapSkeletonSchema = mapDocumentSchema.omit({
  cells: true,
  featuredExamples: true,
  notableGaps: true,
  impossibleCombos: true,
});

export const coordinateCalloutSchema = z.object({
  label: z.string(),
  explanation: z.string(),
  coordinates: z.record(z.string(), z.string()),
});

export const mapCellsBatchSchema = z.object({
  cells: z.array(mapCellSchema),
  featuredExamples: z.array(mapExampleSchema),
  notableGaps: z.array(coordinateCalloutSchema),
  impossibleCombos: z.array(coordinateCalloutSchema),
});

export type MapSkeletonInput = z.infer<typeof mapSkeletonSchema>;
export type MapCellsBatchInput = z.infer<typeof mapCellsBatchSchema>;
