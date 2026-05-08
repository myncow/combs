"use client";

import { Settings as SettingsIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CELL_IMAGE_MODEL } from "@/lib/config";
import { CURATED_IMAGE_MODELS } from "@/lib/image-model-options";
import {
  IMAGE_MODEL_CHANGE_EVENT,
  IMAGE_MODEL_STORAGE_KEY,
  readStoredImageModel,
  writeStoredImageModel,
} from "@/lib/model-preference";
import {
  applyThemePreference,
  persistThemeCookie,
  readStoredThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

function subscribeToImageModel(onChange: () => void) {
  window.addEventListener(IMAGE_MODEL_CHANGE_EVENT, onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === IMAGE_MODEL_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(IMAGE_MODEL_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeToTheme(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => {
    window.removeEventListener("storage", onStorage);
    obs.disconnect();
  };
}

export function SettingsMenu({ collapsed = false }: { collapsed?: boolean }) {
  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const imageModel = useSyncExternalStore(
    subscribeToImageModel,
    readStoredImageModel,
    () => CELL_IMAGE_MODEL,
  );

  const theme = useSyncExternalStore(
    subscribeToTheme,
    readStoredThemePreference,
    () => "system" as ThemePreference,
  );

  const activeModel = useMemo(
    () => CURATED_IMAGE_MODELS.find((m) => m.id === imageModel) ?? CURATED_IMAGE_MODELS[0],
    [imageModel],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    persistThemeCookie(next);
    applyThemePreference(next);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={triggerId}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Settings"
        aria-label="Open settings"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          collapsed ? "w-9" : "w-9 shrink-0",
          open && "border-foreground/40 text-foreground",
        )}
      >
        <SettingsIcon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute left-0 top-full z-30 mt-1 w-[min(320px,90vw)] origin-top-left border border-border bg-card shadow-md"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Settings
            </span>
          </div>

          <fieldset className="border-b border-border px-3 py-3">
            <legend className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Theme
            </legend>
            <div role="radiogroup" aria-label="Theme" className="mt-2 grid grid-cols-3 gap-1">
              {THEME_OPTIONS.map((opt) => {
                const selected = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTheme(opt.id)}
                    className={cn(
                      "h-8 border px-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="px-3 py-3">
            <legend className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Image model
            </legend>
            <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70">
              Active: {activeModel.label}
            </p>
            <ul role="radiogroup" aria-label="Image model" className="mt-2 max-h-[14rem] space-y-px overflow-y-auto">
              {CURATED_IMAGE_MODELS.map((m) => {
                const selected = m.id === imageModel;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => writeStoredImageModel(m.id)}
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 border border-transparent px-2 py-2 text-left transition-colors",
                        selected
                          ? "border-primary/45 bg-[color:color-mix(in_srgb,var(--primary)_10%,transparent)]"
                          : "hover:bg-foreground/[0.04]",
                      )}
                    >
                      <span className="text-[13px] font-medium leading-tight tracking-[-0.01em] text-foreground">
                        {m.label}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {m.provider} · {m.priceLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
