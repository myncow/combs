type JsonSchema = Record<string, unknown>;

const stringArray = {
  type: "array",
  items: { type: "string" },
} satisfies JsonSchema;

const coordinatesSchema = {
  type: "object",
  additionalProperties: { type: "string" },
} satisfies JsonSchema;

const mapStatusSchema = {
  type: "string",
  enum: ["existing", "rare", "gap", "tension", "impossible"],
} satisfies JsonSchema;

const dimensionBriefSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    description: { type: "string" },
  },
  required: ["key", "label", "description"],
  additionalProperties: false,
} satisfies JsonSchema;

const dimensionDocumentSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    description: { type: "string" },
    values: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["key", "label", "description", "values"],
  additionalProperties: false,
} satisfies JsonSchema;

const mapExampleSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    coordinates: coordinatesSchema,
    status: mapStatusSchema,
    brand: { type: "string" },
    year: { type: "string" },
    evidenceNote: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "name",
    "description",
    "coordinates",
    "status",
  ],
  additionalProperties: false,
} satisfies JsonSchema;

const mapCellSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    coordinates: coordinatesSchema,
    label: { type: "string" },
    status: mapStatusSchema,
    explanation: { type: "string" },
    confidence: { type: "number" },
    badges: stringArray,
    examples: {
      type: "array",
      items: mapExampleSchema,
    },
  },
  required: [
    "id",
    "coordinates",
    "label",
    "status",
    "explanation",
    "confidence",
    "badges",
    "examples",
  ],
  additionalProperties: false,
} satisfies JsonSchema;

const coordinateCalloutSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    explanation: { type: "string" },
    coordinates: coordinatesSchema,
  },
  required: ["label", "explanation", "coordinates"],
  additionalProperties: false,
} satisfies JsonSchema;

const suggestAxisCornerJsonSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    description: { type: "string" },
    values: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
    },
  },
  required: ["key", "label", "description", "values"],
  additionalProperties: false,
} satisfies JsonSchema;

const suggestAxisPairItemJsonSchema = {
  type: "object",
  properties: {
    primary: suggestAxisCornerJsonSchema,
    secondary: suggestAxisCornerJsonSchema,
    rationale: { type: "string" },
  },
  required: ["primary", "secondary", "rationale"],
  additionalProperties: false,
} satisfies JsonSchema;

export const suggestAxisPairsResponseJsonSchema = {
  type: "object",
  properties: {
    pairs: {
      type: "array",
      items: suggestAxisPairItemJsonSchema,
      minItems: 4,
      maxItems: 8,
    },
  },
  required: ["pairs"],
  additionalProperties: false,
} satisfies JsonSchema;

export const normalizedMapBriefJsonSchema = {
  type: "object",
  properties: {
    topic: { type: "string" },
    combines: { type: "string" },
    candidateDimensions: stringArray,
    inferDimensions: { type: "boolean" },
    audience: { type: "string" },
    tone: { type: "string" },
    constraints: { type: "string" },
    mustIncludeExamples: stringArray,
    mustAvoid: stringArray,
    extraContext: { type: "string" },
    domain: { type: "string" },
    topicFamily: { type: "string" },
    dimensions: {
      type: "array",
      items: dimensionBriefSchema,
      minItems: 2,
      maxItems: 2,
    },
    accepted: { type: "boolean" },
    guidance: stringArray,
  },
  required: [
    "topic",
    "combines",
    "candidateDimensions",
    "inferDimensions",
    "audience",
    "tone",
    "constraints",
    "mustIncludeExamples",
    "mustAvoid",
    "extraContext",
    "domain",
    "topicFamily",
    "dimensions",
    "accepted",
    "guidance",
  ],
  additionalProperties: false,
} satisfies JsonSchema;

export const mapDocumentJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    summary: { type: "string" },
    intro: { type: "string" },
    domain: { type: "string" },
    topicFamily: { type: "string" },
    dimensions: {
      type: "array",
      items: dimensionDocumentSchema,
      minItems: 2,
      maxItems: 2,
    },
    cells: {
      type: "array",
      items: mapCellSchema,
    },
    featuredExamples: {
      type: "array",
      items: mapExampleSchema,
    },
    notableGaps: {
      type: "array",
      items: coordinateCalloutSchema,
    },
    impossibleCombos: {
      type: "array",
      items: coordinateCalloutSchema,
    },
    constraints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          kind: {
            type: "string",
            enum: ["physical", "cultural", "economic", "taste", "taxonomy"],
          },
          explanation: { type: "string" },
        },
        required: ["label", "kind", "explanation"],
        additionalProperties: false,
      },
    },
    renderingHints: {
      type: "object",
      properties: {
        accent: { type: "string" },
        gradient: {
          type: "array",
          items: { type: "string" },
        },
        icon: { type: "string" },
      },
      required: ["accent", "gradient", "icon"],
      additionalProperties: false,
    },
    seo: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title", "description"],
      additionalProperties: false,
    },
  },
  required: [
    "title",
    "slug",
    "summary",
    "intro",
    "domain",
    "topicFamily",
    "dimensions",
    "cells",
    "featuredExamples",
    "notableGaps",
    "impossibleCombos",
    "constraints",
    "renderingHints",
    "seo",
  ],
  additionalProperties: false,
} satisfies JsonSchema;

export const mapSkeletonJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    summary: { type: "string" },
    intro: { type: "string" },
    domain: { type: "string" },
    topicFamily: { type: "string" },
    dimensions: {
      type: "array",
      items: dimensionDocumentSchema,
      minItems: 2,
      maxItems: 2,
    },
    constraints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          kind: {
            type: "string",
            enum: ["physical", "cultural", "economic", "taste", "taxonomy"],
          },
          explanation: { type: "string" },
        },
        required: ["label", "kind", "explanation"],
        additionalProperties: false,
      },
    },
    renderingHints: {
      type: "object",
      properties: {
        accent: { type: "string" },
        gradient: {
          type: "array",
          items: { type: "string" },
        },
        icon: { type: "string" },
      },
      required: ["accent", "gradient", "icon"],
      additionalProperties: false,
    },
    seo: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title", "description"],
      additionalProperties: false,
    },
  },
  required: [
    "title",
    "slug",
    "summary",
    "intro",
    "domain",
    "topicFamily",
    "dimensions",
    "constraints",
    "renderingHints",
    "seo",
  ],
  additionalProperties: false,
} satisfies JsonSchema;

export const mapCellsJsonSchema = {
  type: "object",
  properties: {
    cells: {
      type: "array",
      items: mapCellSchema,
    },
    featuredExamples: {
      type: "array",
      items: mapExampleSchema,
    },
    notableGaps: {
      type: "array",
      items: coordinateCalloutSchema,
    },
    impossibleCombos: {
      type: "array",
      items: coordinateCalloutSchema,
    },
  },
  required: ["cells", "featuredExamples", "notableGaps", "impossibleCombos"],
  additionalProperties: false,
} satisfies JsonSchema;
