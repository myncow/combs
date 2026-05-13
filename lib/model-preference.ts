import { CELL_IMAGE_MODEL, resolveRequestedImageModel } from "@/lib/config";
import { resolveRequestedChatModel } from "@/lib/chat-model-options";
import { appConfig } from "@/lib/config";

export const IMAGE_MODEL_STORAGE_KEY = "raster-image-model";
export const MAP_MODEL_STORAGE_KEY = "raster-map-model";
export const RESEARCH_MODEL_STORAGE_KEY = "raster-research-model";
export const SUGGEST_MODEL_STORAGE_KEY = "raster-suggest-model";

export const IMAGE_MODEL_CHANGE_EVENT = "raster:model-change";
export const CHAT_MODEL_CHANGE_EVENT = "raster:chat-model-change";

function dispatchImageModelChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IMAGE_MODEL_CHANGE_EVENT));
}

function dispatchChatModelChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_MODEL_CHANGE_EVENT));
}

// ---------------------------------------------------------------------------
// Image model
// ---------------------------------------------------------------------------

export function readStoredImageModel(): string {
  if (typeof window === "undefined") {
    return CELL_IMAGE_MODEL;
  }
  try {
    const raw = localStorage.getItem(IMAGE_MODEL_STORAGE_KEY);
    return resolveRequestedImageModel(raw ?? undefined);
  } catch {
    /* private mode */
  }
  return CELL_IMAGE_MODEL;
}

export function writeStoredImageModel(modelId: string): void {
  const id = resolveRequestedImageModel(modelId);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
  dispatchImageModelChange();
}

// ---------------------------------------------------------------------------
// Chat models (map, research, suggest)
// ---------------------------------------------------------------------------

function readStoredChatModel(key: string, defaultModel: string): string {
  if (typeof window === "undefined") return defaultModel;
  try {
    const raw = localStorage.getItem(key);
    return resolveRequestedChatModel(raw ?? undefined, defaultModel);
  } catch {
    /* private mode */
  }
  return defaultModel;
}

function writeStoredChatModel(key: string, modelId: string, defaultModel: string): void {
  const id = resolveRequestedChatModel(modelId, defaultModel);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, id);
  } catch {
    /* private mode */
  }
  dispatchChatModelChange();
}

export function readStoredMapModel(): string {
  return readStoredChatModel(MAP_MODEL_STORAGE_KEY, appConfig.openRouter.model);
}

export function writeStoredMapModel(modelId: string): void {
  writeStoredChatModel(MAP_MODEL_STORAGE_KEY, modelId, appConfig.openRouter.model);
}

export function readStoredResearchModel(): string {
  return readStoredChatModel(RESEARCH_MODEL_STORAGE_KEY, appConfig.openRouter.researchModel);
}

export function writeStoredResearchModel(modelId: string): void {
  writeStoredChatModel(RESEARCH_MODEL_STORAGE_KEY, modelId, appConfig.openRouter.researchModel);
}

export function readStoredSuggestModel(): string {
  return readStoredChatModel(SUGGEST_MODEL_STORAGE_KEY, appConfig.openRouter.suggestModel);
}

export function writeStoredSuggestModel(modelId: string): void {
  writeStoredChatModel(SUGGEST_MODEL_STORAGE_KEY, modelId, appConfig.openRouter.suggestModel);
}

// ---------------------------------------------------------------------------
// Unified snapshot
// ---------------------------------------------------------------------------

export type AllModelPreferences = {
  mapModel: string;
  researchModel: string;
  suggestModel: string;
  imageModel: string;
};

/** Read all four model preferences in one call (client-side only). */
export function readAllModelPreferences(): AllModelPreferences {
  return {
    mapModel: readStoredMapModel(),
    researchModel: readStoredResearchModel(),
    suggestModel: readStoredSuggestModel(),
    imageModel: readStoredImageModel(),
  };
}
