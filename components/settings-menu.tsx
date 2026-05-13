"use client";

import Link from "next/link";
import { Settings as SettingsIcon, Shield } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  applyThemePreference,
  persistThemeCookie,
  readStoredThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme-preference";
import { MenuPanel } from "@/components/raster-shell";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Auto" },
];

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

export function SettingsMenu({ isAdmin = false }: { isAdmin?: boolean }) {
  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const theme = useSyncExternalStore(
    subscribeToTheme,
    readStoredThemePreference,
    () => "system" as ThemePreference,
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
          className="absolute right-0 top-full z-30 mt-1.5 w-[min(340px,92vw)] origin-top-right"
        >
          <div className="border-b border-border px-4 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Settings
            </span>
          </div>

          <fieldset className="m-0 min-w-0 border-0 p-0 px-4 py-3.5">
            <legend className="float-none mb-0 block w-full p-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Theme
            </legend>
            <div role="radiogroup" aria-label="Theme" className="mt-2.5 grid grid-cols-3 gap-px border border-border bg-border">
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
                      "h-9 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      selected
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-card hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {isAdmin ? (
            <div className="border-t border-border px-4 py-3">
              <Link
                role="menuitem"
                href="/admin/maps"
                onClick={() => setOpen(false)}
                className="inline-flex w-full items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Shield className="h-3.5 w-3.5 text-primary" aria-hidden strokeWidth={2.25} />
                Admin · all maps
              </Link>
            </div>
          ) : null}
        </MenuPanel>
      ) : null}
    </div>
  );
}
