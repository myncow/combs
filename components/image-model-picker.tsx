"use client";

import { Button } from "@/components/ui/button";
import { CELL_IMAGE_MODEL } from "@/lib/config";
import { CURATED_IMAGE_MODELS } from "@/lib/image-model-options";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  IMAGE_MODEL_CHANGE_EVENT,
  IMAGE_MODEL_STORAGE_KEY,
  readStoredImageModel,
  writeStoredImageModel,
} from "@/lib/model-preference";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

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
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const value = useSyncExternalStore(
    subscribeToImageModel,
    readStoredImageModel,
    () => CELL_IMAGE_MODEL,
  );
  const [open, setOpen] = useState(false);

  const panelTransition = reduceMotion
    ? { duration: 0 }
    : { duration: MOTION_DURATION.short, ease: MOTION_EASE.out };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const active = CURATED_IMAGE_MODELS.find((m) => m.id === value) ?? CURATED_IMAGE_MODELS[0];

  const pick = (id: string) => {
    writeStoredImageModel(id);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative ml-auto flex min-w-0 max-w-[min(100%,26rem)] flex-row flex-wrap items-center justify-end gap-2 sm:max-w-[28rem] sm:flex-nowrap"
    >
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/65 sm:text-[11px]">
        Image model
      </span>
      <div className="relative min-w-0 flex-1 basis-[12rem] sm:basis-auto sm:max-w-[19rem]">
        <Button
          type="button"
          variant="outline"
          size="sm"
          id={`${listId}-trigger`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${listId}-listbox`}
          title="OpenRouter model for cell scene images"
          onClick={() => setOpen((o) => !o)}
          className="h-9 w-full min-w-0 max-w-full justify-between gap-2 border-border bg-background/80 px-3 text-left font-mono normal-case tracking-normal backdrop-blur-sm"
        >
          <span className="min-w-0 truncate font-sans text-[14px] font-medium leading-tight text-foreground">
            {active.label}
            <span className="font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-foreground/55">
              {" "}
              · {active.provider}
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-foreground"
            strokeWidth={2}
            aria-hidden
          />
        </Button>

        <AnimatePresence>
          {open ? (
            <motion.ul
              id={`${listId}-listbox`}
              role="listbox"
              aria-label="Image generation models"
              aria-activedescendant={`${listId}-${value.replace(/[^a-zA-Z0-9_-]+/g, "_")}`}
              initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : -6 }}
              transition={panelTransition}
              className="absolute right-0 top-full z-30 mt-1 max-h-[min(60vh,20rem)] w-full min-w-[17.5rem] origin-top overflow-auto border border-border bg-card py-1 shadow-md"
            >
              {CURATED_IMAGE_MODELS.map((m) => {
                const selected = m.id === value;
                const optionDomId = `${listId}-${m.id.replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
                return (
                  <li key={m.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      id={optionDomId}
                      onClick={() => pick(m.id)}
                      className={cn(
                        "flex w-full flex-col items-stretch gap-0.5 px-3 py-2.5 text-left transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        selected
                          ? "bg-primary/15"
                          : "hover:bg-foreground/10",
                      )}
                    >
                      <span className="font-sans text-[14px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
                        {m.label}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/60">
                        {m.provider}
                        <span className="mx-1.5 text-foreground/35">·</span>
                        {m.priceLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
