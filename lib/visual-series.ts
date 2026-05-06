import type { MapDocument, MapVisualSeriesPresetId, MapVisualStyleSpec } from "@/lib/types";

type VisualSeriesRecipe = {
  presetId: MapVisualSeriesPresetId;
  label: string;
  overview: string;
  /** Whether this preset is a craft/diorama medium rather than direct photography. Used to soften the photorealism mandate downstream. */
  isCraftMedium?: boolean;
  styleSpec: MapVisualStyleSpec;
};

type ResolvedVisualSeriesRecipe = VisualSeriesRecipe & {
  promptBlock: string;
};

const LIVING_THING_PATTERN =
  /\b(bird|birds|avian|fish|fishes|shark|sharks|mammal|mammals|animal|animals|insect|insects|flower|flowers|plant|plants|tree|trees|leaf|leaves|fungi|fungus|mushroom|mushrooms|coral|corals|reptile|reptiles|amphibian|amphibians|butterfly|butterflies|orchid|orchids)\b/i;
const FOOD_PATTERN =
  /\b(bread|tea|food|drink|beverage|cheese|sausage|cocktail|dessert|pastry|fruit|vegetable|vegetables|fermentation|fermented|wine|coffee|cuisine|noodle|soup|spice|spices|herb|herbs)\b/i;
const STUDIO_PRODUCT_PATTERN =
  /\b(camera|cameras|watch|watches|chair|chairs|lamp|lamps|sneaker|sneakers|footwear|shoe|shoes|bag|bags|bottle|bottles|knife|knives|tool|tools|appliance|appliances|console|consoles|headphone|headphones|earbud|earbuds|controller|controllers|accessor(?:y|ies))\b/i;
const DOCUMENTARY_CONTEXT_PATTERN =
  /\b(architect(?:ure)?|building|buildings|vehicle|vehicles|machine|machines|tractor|tractors|industrial|factory|factories|workshop|workshops|kiln|kilns|forge|forges|loom|looms|press|presses|atelier|stall|stalls|market|markets|farm|farms)\b/i;
const MACRO_DETAIL_PATTERN =
  /\b(textile|textiles|fabric|fabrics|weave|weaves|fiber|fibers|stitch|stitches|grain|grains|ceramic|ceramics|stone|stones|mineral|minerals|pigment|pigments|dye|dyes|paper|papers|leather|leathers|coating|coatings|finish|finishes|surface|surfaces|texture|textures)\b/i;

const VISUAL_SERIES_RECIPES: Record<MapVisualSeriesPresetId, VisualSeriesRecipe> = {
  "natural-history-plate": {
    presetId: "natural-history-plate",
    label: "Natural History Plate",
    overview: "Photorealistic field-guide specimen imagery with restrained color and a habitat fragment instead of a blank backdrop.",
    styleSpec: {
      medium: "Photorealistic field-guide specimen photography with natural lens detail.",
      composition:
        "One primary subject filling roughly 60-80% of the square frame; prefer side-profile or three-quarter views that make anatomy legible.",
      background: "A restrained habitat fragment or field context that supports identification without taking over the image.",
      lighting: "Soft daylight with gentle contrast.",
      palette: "Moss, cream, chestnut, slate, and muted blue with restrained saturation.",
      surfaceFeel: "Fine photographic detail, believable depth of field, and tactile feather, fur, leaf, or skin texture.",
      negativePrompts: [
        "painting",
        "watercolor",
        "field-guide illustration",
        "retail catalog staging",
        "blank studio sweep",
        "glossy e-commerce polish",
      ],
    },
  },
  "editorial-habitat-photo": {
    presetId: "editorial-habitat-photo",
    label: "Editorial Habitat Photo",
    overview: "Documentary-style photography with natural light, off-center composition, and lived-in environmental context.",
    styleSpec: {
      medium: "Documentary-quality photography, never product photography.",
      composition:
        "One primary subject filling roughly 60-80% of the frame, with room for habitat or working context; avoid tiny subject or huge background compositions.",
      background: "A real environment, work surface, or surrounding material context that tells us where the subject belongs.",
      lighting: "Natural or practical light with restrained grading and calm contrast.",
      palette: "Honest color with gentle grading and no glossy commercial sheen.",
      surfaceFeel: "Observed texture, lens realism, and magazine-feature intimacy.",
      negativePrompts: [
        "catalog hero shot",
        "sterile studio lighting",
        "retail product isolation",
      ],
    },
  },
  "studio-product": {
    presetId: "studio-product",
    label: "Studio Product",
    overview: "Magazine-grade photography of a single engineered or designed object on a clean, characterful surface that lets material and form read clearly.",
    styleSpec: {
      medium: "Photorealistic editorial product photography with calibrated optics and visible material truth.",
      composition:
        "One primary object filling roughly 65-80% of the frame; pick the angle that exposes the diagnostic silhouette and at least two coordinate-bearing details.",
      background: "A simple but characterful surface — paper, stone, fabric, or studio sweep with a single soft gradient — never a sterile cyclorama.",
      lighting: "Soft directional light shaping form, with a controlled secondary fill that keeps shadows informative rather than flat.",
      palette: "Material-true color with restrained grading; metals stay metallic, plastics stay plastic, fabrics stay fibrous.",
      surfaceFeel: "Crisp focus on the subject, believable specular highlights, and visible micro-texture in metals, polymers, and fabrics.",
      negativePrompts: [
        "blown-out e-commerce lighting",
        "drop-shadow-on-white catalog cutout",
        "stock photo cliché",
        "marketing render with fake studio sweep",
        "uncanny CG plastic finish",
      ],
    },
  },
  "documentary-context": {
    presetId: "documentary-context",
    label: "Documentary Context",
    overview: "Reportage-style photography of objects, machinery, or built environments in their working context, with believable depth of field and ambient light.",
    styleSpec: {
      medium: "Documentary photojournalism with natural-light optics and a single primary subject placed inside its actual operating environment.",
      composition:
        "One primary subject filling roughly 50-70% of the frame, surrounded by the real workspace, building, or landscape that contextualizes its use.",
      background: "An honest operating context: workshop, street, factory floor, dwelling, field, or workbench. Never a green-screen or fake studio.",
      lighting: "Available light with realistic falloff and color cast from the practical sources actually present in the scene.",
      palette: "Faithful reportage color; do not push saturation, do not add commercial grading.",
      surfaceFeel: "Lens realism, atmospheric depth cues, and visible wear or use.",
      negativePrompts: [
        "studio backdrop",
        "advertising lighting",
        "perfect symmetry",
        "everything-in-focus 3D render",
        "tilt-shift miniature look",
      ],
    },
  },
  "macro-detail": {
    presetId: "macro-detail",
    label: "Macro Detail",
    overview: "Close-up photography of materials, weaves, finishes, or surface treatments where the subject's texture is itself the protagonist.",
    styleSpec: {
      medium: "Photorealistic macro photography with shallow depth of field and tactile texture rendering.",
      composition:
        "Tightly framed on the subject; the texture, weave, or surface treatment fills 70-90% of the frame with a small contextual edge.",
      background: "A blurred but real environmental cue — workbench, hand, cloth, or adjacent material — never a flat color sweep.",
      lighting: "Raking or directional light that shows weave, stitch, grain, or finish topography clearly.",
      palette: "Material-true with subtle gradient grading; preserve the original color of the substrate.",
      surfaceFeel: "Hyper-tactile macro clarity with visible fiber, grain, pore, or tool-mark detail.",
      negativePrompts: [
        "abstract pattern",
        "render-engine seamless tile",
        "AI-stylized fractal close-up",
        "uniformly lit catalog swatch",
      ],
    },
  },
  "tactile-diorama": {
    presetId: "tactile-diorama",
    label: "Tactile Diorama",
    overview: "Photorealistic macro photography of handmade miniature worlds with dimensional materials, soft shadows, and a clear tactile sense of construction.",
    isCraftMedium: true,
    styleSpec: {
      medium: "Photorealistic macro photography of a handcrafted miniature scene using paper, painted board, wood, clay, or felt-like materials.",
      composition:
        "One primary subject filling roughly 60-80% of the frame inside a compact, believable set.",
      background: "A simple built environment or stage-like habitat that supports the subject without becoming a busy collage.",
      lighting: "Soft directional light with gentle shadows.",
      palette: "Warm-neutral palette with visible material edges and controlled contrast.",
      surfaceFeel: "Real photographed material texture, dimensional edges, and slight handmade imperfections.",
      negativePrompts: [
        "flat illustration",
        "concept sketch",
        "slick CG finish",
        "corporate explainer aesthetic",
        "busy collage layout",
      ],
    },
  },
};

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function styleSpecToPromptBlock(label: string, spec: MapVisualStyleSpec) {
  const paletteAnchors =
    spec.accentHex || spec.gradientHexes?.length
      ? ` Map palette anchors: ${[
          spec.accentHex ? `accent ${spec.accentHex}` : "",
          spec.gradientHexes?.length ? `gradient ${spec.gradientHexes.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; ")}.`
      : "";

  return `## Series style
Render every image in this map as part of the same ${label.toLowerCase()} series.
- Medium: ${spec.medium}
- Composition: ${spec.composition}
- Background: ${spec.background}
- Light and color: ${spec.lighting} Palette: ${spec.palette}.${paletteAnchors}
- Surface feel: ${spec.surfaceFeel}
- Avoid: ${spec.negativePrompts.join("; ")}.
- The image should feel coherent across the whole map, not like isolated one-off renders.`;
}

function withRenderingHints(base: MapVisualStyleSpec, document: MapDocument): MapVisualStyleSpec {
  const accentHex = document.renderingHints?.accent;
  const gradientHexes = Array.isArray(document.renderingHints?.gradient)
    ? document.renderingHints.gradient.slice(0, 4)
    : undefined;

  return {
    ...base,
    accentHex,
    gradientHexes,
    palette: uniqueStrings([
      base.palette,
      accentHex ? `Use the map accent ${accentHex} as a subtle recurring color cue.` : "",
      gradientHexes?.length
        ? `Borrow supporting hues from the map gradient: ${gradientHexes.join(", ")}.`
        : "",
    ]).join(" "),
    negativePrompts: uniqueStrings(base.negativePrompts),
  };
}

/**
 * Pick a preset from the document's domain/title/family. Patterns are
 * ordered by specificity-of-fit, not just specificity-of-keyword: a
 * "leather bag" map should be a studio-product photograph (the bag is the
 * subject), not a macro-detail close-up of leather grain — so
 * `studio-product` wins over `macro-detail` when keywords from both fire.
 *
 *   1. living things         (natural-history-plate)
 *   2. food                  (editorial-habitat-photo)
 *   3. discrete designed objects (studio-product)
 *   4. operating scenes      (documentary-context)
 *   5. textures / surfaces   (macro-detail)
 *
 * The default is `studio-product` rather than `tactile-diorama` because
 * most engineered/designed domains want photographic realism, not a
 * craft-medium stand-in.
 */
function inferPresetId(document: MapDocument): MapVisualSeriesPresetId {
  const haystack = [document.domain, document.title, document.summary, document.topicFamily, document.intro]
    .filter(Boolean)
    .join(" ");
  if (LIVING_THING_PATTERN.test(haystack)) {
    return "natural-history-plate";
  }
  if (FOOD_PATTERN.test(haystack) || document.topicFamily === "Food & Drink") {
    return "editorial-habitat-photo";
  }
  if (STUDIO_PRODUCT_PATTERN.test(haystack)) {
    return "studio-product";
  }
  if (DOCUMENTARY_CONTEXT_PATTERN.test(haystack)) {
    return "documentary-context";
  }
  if (MACRO_DETAIL_PATTERN.test(haystack)) {
    return "macro-detail";
  }
  return "studio-product";
}

export function resolveMapVisualSeries(document: MapDocument): ResolvedVisualSeriesRecipe {
  const persistedPresetId = document.visualSeries?.presetId;
  // Fall back to inference if a persisted preset id is not in the registry
  // (e.g. legacy or expanded enum values that don't exist anymore).
  const presetId = persistedPresetId && persistedPresetId in VISUAL_SERIES_RECIPES
    ? persistedPresetId
    : inferPresetId(document);
  const recipe = VISUAL_SERIES_RECIPES[presetId];
  const styleSpec = document.visualSeries?.styleSpec ?? withRenderingHints(recipe.styleSpec, document);

  return {
    ...recipe,
    styleSpec,
    promptBlock: styleSpecToPromptBlock(recipe.label, styleSpec),
  };
}

export function attachVisualSeries(document: MapDocument): MapDocument {
  const recipe = resolveMapVisualSeries(document);
  return {
    ...document,
    visualSeries: {
      presetId: recipe.presetId,
      label: recipe.label,
      overview: recipe.overview,
      styleSpec: recipe.styleSpec,
    },
  };
}
