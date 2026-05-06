import { CELL_IMAGE_MODEL, resolveRequestedImageModel } from "@/lib/config";

export const IMAGE_MODEL_STORAGE_KEY = "raster-image-model";

export const IMAGE_MODEL_CHANGE_EVENT = "raster:model-change";

function dispatchImageModelChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IMAGE_MODEL_CHANGE_EVENT));
}

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
