"use client";

import Link from "next/link";
import { ChevronDown, Monitor, Moon, Settings as SettingsIcon, Shield, Sun } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  persistThemePreference,
  readStoredThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme-preference";
import { MenuPanel } from "@/components/raster-shell";
import { cn } from "@/lib/utils";
import { CURATED_CHAT_MODELS, labelForChatModelId } from "@/lib/chat-model-options";
import { CURATED_IMAGE_MODELS, labelForImageModelId } from "@/lib/image-model-options";
import { CELL_IMAGE_MODEL } from "@/lib/config";
import {
  CHAT_MODEL_CHANGE_EVENT,
  IMAGE_MODEL_CHANGE_EVENT,
  IMAGE_MODEL_STORAGE_KEY,
  MAP_MODEL_STORAGE_KEY,
  RESEARCH_MODEL_STORAGE_KEY,
  SUGGEST_MODEL_STORAGE_KEY,
  readStoredImageModel,
  readStoredMapModel,
  readStoredResearchModel,
  readStoredSuggestModel,
  writeStoredImageModel,
  writeStoredMapModel,
  writeStoredResearchModel,
  writeStoredSuggestModel,
} from "@/lib/model-preference";
import { appConfig } from "@/lib/config";

const THEME_OPTIONS: ReadonlyArray<{
  id: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "Auto", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
];

function subscribeToTheme(onChange: () => void) {
  // 1. Same-tab updates: a custom event fired by `persistThemePreference`.
  //    Required because `localStorage.setItem` does NOT trigger the
  //    `storage` event in the writing tab, and a MutationObserver on
  //    `<html>` misses no-op transitions like Light → Auto when the OS
  //    is already light.
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  // 2. Cross-tab updates: another tab wrote to localStorage.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeToChatModels(onChange: () => void) {
  const storageKeys = [MAP_MODEL_STORAGE_KEY, RESEARCH_MODEL_STORAGE_KEY, SUGGEST_MODEL_STORAGE_KEY];
  const onStorage = (e: StorageEvent) => {
    if (e.key && storageKeys.includes(e.key)) onChange();
  };
  window.addEventListener(CHAT_MODEL_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHAT_MODEL_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeToImageModel(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === IMAGE_MODEL_STORAGE_KEY) onChange();
  };
  window.addEventListener(IMAGE_MODEL_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(IMAGE_MODEL_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

type ModelRowProps = {
  label: string;
  options: ReadonlyArray<{ id: string; label: string; provider: string; priceLabel: string }>;
  value: string;
  onChange: (id: string) => void;
  defaultId: string;
};

function ModelRow({ label, options, value, onChange, defaultId }: ModelRowProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const active = options.find((m) => m.id === value) ?? options[0];
  const isDefault = value === defaultId;

  return (
    <div className="flex items-center gap-2 py-0.5" ref={rootRef}>
      <span className="w-[72px] shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55">
        {label}
      </span>
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          id={`${listId}-trigger`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${listId}-listbox`}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex h-7 w-full items-center justify-between gap-1.5 border px-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "border-border bg-background text-foreground hover:border-foreground/30",
            open && "border-foreground/40",
          )}
        >
          <span className="min-w-0 truncate font-sans text-[12px] leading-tight">
            {active?.label ?? "—"}
            {isDefault ? (
              <span className="ml-1 font-mono text-[10px] text-foreground/35">default</span>
            ) : null}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-foreground/60" strokeWidth={2} aria-hidden />
        </button>

        {open ? (
          <MenuPanel className="absolute left-0 top-full z-50 mt-0.5 w-[min(220px,90vw)] origin-top-left py-1">
            <ul
              id={`${listId}-listbox`}
              role="listbox"
              aria-label={`${label} model`}
            >
              {options.map((m) => {
                const selected = m.id === value;
                return (
                  <li key={m.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { onChange(m.id); setOpen(false); }}
                      className={cn(
                        "flex w-full flex-col items-stretch gap-0 px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        selected ? "bg-primary/15" : "hover:bg-foreground/10",
                      )}
                    >
                      <span className="font-sans text-[12px] font-semibold leading-tight text-foreground">
                        {m.label}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55">
                        {m.provider}
                        <span className="mx-1 text-foreground/30">·</span>
                        {m.priceLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </MenuPanel>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const theme = useSyncExternalStore(
    subscribeToTheme,
    readStoredThemePreference,
    () => "system" as ThemePreference,
  );

  const mapModel = useSyncExternalStore(
    subscribeToChatModels,
    readStoredMapModel,
    () => appConfig.openRouter.model,
  );
  const researchModel = useSyncExternalStore(
    subscribeToChatModels,
    readStoredResearchModel,
    () => appConfig.openRouter.researchModel,
  );
  const suggestModel = useSyncExternalStore(
    subscribeToChatModels,
    readStoredSuggestModel,
    () => appConfig.openRouter.suggestModel,
  );
  const imageModel = useSyncExternalStore(
    subscribeToImageModel,
    readStoredImageModel,
    () => CELL_IMAGE_MODEL,
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
    persistThemePreference(next);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={triggerId}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Settings"
        aria-label="Open settings"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open && "border-foreground/40 text-foreground",
        )}
      >
        <SettingsIcon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
      </button>

      {open ? (
        <MenuPanel
          role="menu"
          aria-label="Settings"
          aria-labelledby={triggerId}
          className="absolute right-0 top-full z-30 mt-1.5 w-[min(260px,92vw)] origin-top-right p-2"
        >
          {/* Theme — three radio cells. The selected one inverts colors
              AND shows a checked dot in the corner so the picker reads
              clearly even at small sizes / for users who can't rely on
              the inversion alone. */}
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-3 gap-1"
          >
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${opt.label} theme`}
                  title={opt.label}
                  onClick={() => setTheme(opt.id)}
                  className={cn(
                    "relative inline-flex h-12 flex-col items-center justify-center gap-1 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.18em]">
                    {opt.label}
                  </span>
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary-foreground"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Models */}
          <div className="mt-2 border-t border-border pt-2">
            <p className="pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/45">
              Models
            </p>
            <ModelRow
              label="Map"
              options={CURATED_CHAT_MODELS}
              value={mapModel}
              onChange={writeStoredMapModel}
              defaultId={appConfig.openRouter.model}
            />
            <ModelRow
              label="Research"
              options={CURATED_CHAT_MODELS}
              value={researchModel}
              onChange={writeStoredResearchModel}
              defaultId={appConfig.openRouter.researchModel}
            />
            <ModelRow
              label="Suggest"
              options={CURATED_CHAT_MODELS}
              value={suggestModel}
              onChange={writeStoredSuggestModel}
              defaultId={appConfig.openRouter.suggestModel}
            />
            <ModelRow
              label="Image"
              options={CURATED_IMAGE_MODELS}
              value={imageModel}
              onChange={writeStoredImageModel}
              defaultId={CELL_IMAGE_MODEL}
            />
          </div>

          {isAdmin ? (
            <Link
              role="menuitem"
              href="/admin/maps"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-9 w-full items-center gap-2 border border-border bg-background px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Shield className="h-3.5 w-3.5 text-primary" aria-hidden strokeWidth={2.25} />
              Admin · all maps
            </Link>
          ) : null}
        </MenuPanel>
      ) : null}
    </div>
  );
}
