/** Curated OpenRouter slugs for `modalities: ["image"]` cell visualization. Shared by client picker and server allowlist. */

export type CuratedImageModelOption = {
  id: string;
  label: string;
  provider: string;
  priceLabel: string;
};

export const CURATED_IMAGE_MODELS: readonly CuratedImageModelOption[] = [
  {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    provider: "Google",
    priceLabel: "$0.50/M in · $3/M out",
  },
  {
    id: "google/gemini-3-pro-image-preview",
    label: "Nano Banana Pro",
    provider: "Google",
    priceLabel: "Premium · 2K/4K",
  },
  {
    id: "bytedance-seed/seedream-4.5",
    label: "Seedream 4.5",
    provider: "ByteDance",
    priceLabel: "$0.04/image",
  },
  {
    id: "openai/gpt-5.4-image-2",
    label: "GPT-5.4 Image 2",
    provider: "OpenAI",
    priceLabel: "$8/M in · $15/M out",
  },
  {
    id: "black-forest-labs/flux.2-max",
    label: "FLUX.2 Max",
    provider: "BFL",
    priceLabel: "$0.07/MP+",
  },
] as const;

export function labelForImageModelId(id: string): string {
  const entry = CURATED_IMAGE_MODELS.find((m) => m.id === id);
  if (entry) return entry.label;
  const tail = id.split("/").pop();
  return tail && tail.length > 0 ? tail : id;
}
