"use client";

import { CELL_IMAGE_MODEL } from "@/lib/config";
import { CURATED_IMAGE_MODELS } from "@/lib/image-model-options";
import {
  IMAGE_MODEL_CHANGE_EVENT,
  IMAGE_MODEL_STORAGE_KEY,
  readStoredImageModel,
  writeStoredImageModel,
} from "@/lib/model-preference";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSyncExternalStore } from "react";

function subscribeToImageModel(onStoreChange: () => void) {
  window.addEventListener(IMAGE_MODEL_CHANGE_EVENT, onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === IMAGE_MODEL_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(IMAGE_MODEL_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function ImageModelPicker() {
  const value = useSyncExternalStore(
    subscribeToImageModel,
    readStoredImageModel,
    () => CELL_IMAGE_MODEL,
  );
  const active = CURATED_IMAGE_MODELS.find((m) => m.id === value) ?? CURATED_IMAGE_MODELS[0];

  return (
    <div className="relative flex min-w-0 max-w-[min(100%,26rem)] flex-1 basis-[16rem] flex-row flex-wrap items-center justify-end gap-2 sm:max-w-[28rem] sm:flex-nowrap">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/65 sm:text-[11px]">
        Image model
      </span>
      <div className="relative min-w-0 flex-1 basis-[12rem] sm:basis-auto sm:max-w-[19rem]">
        <Select value={value} onValueChange={writeStoredImageModel}>
          <SelectTrigger
            size="default"
            aria-label="OpenRouter model for cell scene images"
            className="!h-9 w-full justify-between gap-2 rounded-none border-border bg-background/80 px-3 font-sans text-[14px] backdrop-blur-sm hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SelectValue>
              <span className="min-w-0 truncate text-foreground">
                {active.label}
                <span className="font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-foreground/55">
                  {" "}
                  · {active.provider}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={4}
            align="end"
            className="max-h-[min(60vh,20rem)] w-[var(--radix-select-trigger-width)] min-w-[17.5rem] rounded-none border-border"
          >
            {CURATED_IMAGE_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id} className="rounded-none px-3 py-2.5">
                <div className="flex flex-col items-stretch gap-0.5">
                  <span className="font-sans text-[14px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
                    {m.label}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/60">
                    {m.provider}
                    <span className="mx-1.5 text-foreground/35">·</span>
                    {m.priceLabel}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
