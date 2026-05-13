/** Curated OpenRouter chat-completion model slugs for map, research, and suggest steps. */

export type CuratedChatModelOption = {
  id: string;
  label: string;
  provider: string;
  priceLabel: string;
};

export const CURATED_CHAT_MODELS: readonly CuratedChatModelOption[] = [
  {
    id: "google/gemini-3.1-flash-lite-preview",
    label: "Gemini Flash Lite",
    provider: "Google",
    priceLabel: "$0.10/$0.40 /M",
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini Flash",
    provider: "Google",
    priceLabel: "$0.075/$0.30 /M",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    priceLabel: "$0.15/$0.60 /M",
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    provider: "OpenAI",
    priceLabel: "$0.40/$1.60 /M",
  },
  {
    id: "openai/gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    provider: "OpenAI",
    priceLabel: "$0.10/$0.40 /M",
  },
] as const;

const curatedChatModelIds = new Set(CURATED_CHAT_MODELS.map((m) => m.id));

export function isAllowedChatModel(id: string | undefined | null): id is string {
  return typeof id === "string" && curatedChatModelIds.has(id.trim());
}

/**
 * Normalise a client-submitted chat model slug. Falls back to the provided
 * `defaultModel` if the value is absent or not in the curated list.
 */
export function resolveRequestedChatModel(
  requested: string | undefined | null,
  defaultModel: string,
): string {
  if (typeof requested !== "string") return defaultModel;
  const t = requested.trim();
  return isAllowedChatModel(t) ? t : defaultModel;
}

export function labelForChatModelId(id: string): string {
  const entry = CURATED_CHAT_MODELS.find((m) => m.id === id);
  if (entry) return entry.label;
  const tail = id.split("/").pop();
  return tail && tail.length > 0 ? tail : id;
}
