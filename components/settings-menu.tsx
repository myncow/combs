"use client";

import Link from "next/link";
import { Monitor, Moon, Settings as SettingsIcon, Shield, Sun } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  ACCENT_CHANGE_EVENT,
  ACCENT_STORAGE_KEY,
  persistAccentTheme,
  persistThemePreference,
  readStoredAccentTheme,
  readStoredThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type AccentTheme,
  type ThemePreference,
} from "@/lib/theme-preference";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/* Each accent shows the same neutral surface plus a swatch. The swatch
 * colour is inlined so it stays visible regardless of which accent the
 * page is currently rendering. Light/dark variants kept side-by-side
 * so the picker reads the same in both modes. */
const ACCENT_OPTIONS: ReadonlyArray<{
  id: AccentTheme;
  label: string;
  light: string;
  dark: string;
}> = [
  { id: "cobalt", label: "Cobalt", light: "#2b4a8b", dark: "#6e8fc9" },
  { id: "graphite", label: "Graphite", light: "#1c1e1f", dark: "#e8eae4" },
  { id: "moss", label: "Moss", light: "#3b5d3a", dark: "#8aab85" },
  { id: "rust", label: "Rust", light: "#8a4a2f", dark: "#c98a6e" },
];

function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function subscribeToAccent(onChange: () => void) {
  window.addEventListener(ACCENT_CHANGE_EVENT, onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACCENT_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ACCENT_CHANGE_EVENT, onChange);
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
  const isDefault = value === defaultId;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-[72px] shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger
            size="sm"
            className="!h-7 w-full rounded-none border-border bg-background px-2 font-sans text-[12px] hover:border-foreground/30 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`${label} model`}
          >
            <SelectValue>
              <span className="min-w-0 truncate">
                {options.find((m) => m.id === value)?.label ?? "—"}
                {isDefault ? (
                  <span className="ml-1 font-mono text-[10px] text-foreground/35">default</span>
                ) : null}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={2}
            className="rounded-none border-border"
          >
            {options.map((m) => (
              <SelectItem key={m.id} value={m.id} className="rounded-none px-3 py-2">
                <div className="flex flex-col items-stretch gap-0">
                  <span className="font-sans text-[12px] font-semibold leading-tight text-foreground">
                    {m.label}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55">
                    {m.provider}
                    <span className="mx-1 text-foreground/30">·</span>
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

export function SettingsMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);

  const theme = useSyncExternalStore(
    subscribeToTheme,
    readStoredThemePreference,
    () => "system" as ThemePreference,
  );

  const accent = useSyncExternalStore(
    subscribeToAccent,
    readStoredAccentTheme,
    () => "cobalt" as AccentTheme,
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

  // Silence unused-import warnings — used elsewhere for accessibility labels.
  void labelForChatModelId;
  void labelForImageModelId;

  const setTheme = useCallback((next: ThemePreference) => {
    persistThemePreference(next);
  }, []);
  const setAccent = useCallback((next: AccentTheme) => {
    persistAccentTheme(next);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Settings"
          aria-label="Open settings"
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 touch-manipulation hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            open && "border-foreground/40 text-foreground",
          )}
        >
          <SettingsIcon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(260px,92vw)] rounded-none border-border p-2 gap-0"
        aria-label="Settings"
      >
        {/* Theme — light / auto / dark */}
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1">
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
                  "relative inline-flex h-12 flex-col items-center justify-center gap-1 border touch-manipulation transition-[color,background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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

        {/* Accent — small chip swatches in a 4-column grid */}
        <div className="mt-2 border-t border-border pt-2">
          <p className="pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/45">
            Accent
          </p>
          <div role="radiogroup" aria-label="Accent" className="grid grid-cols-4 gap-1">
            {ACCENT_OPTIONS.map((opt) => {
              const selected = accent === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${opt.label} accent`}
                  title={opt.label}
                  onClick={() => setAccent(opt.id)}
                  className={cn(
                    "relative inline-flex h-12 flex-col items-center justify-center gap-1 border touch-manipulation transition-[border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selected
                      ? "border-foreground/55"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  <span
                    aria-hidden
                    className="block h-3 w-3"
                    style={{
                      background: `linear-gradient(135deg, ${opt.light} 0% 50%, ${opt.dark} 50% 100%)`,
                    }}
                  />
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
                    {opt.label}
                  </span>
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-foreground"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
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
            href="/admin/maps"
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex h-9 w-full items-center gap-2 border border-border bg-background px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors touch-manipulation hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Shield className="h-3.5 w-3.5 text-primary" aria-hidden strokeWidth={2.25} />
            Admin · all maps
          </Link>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
