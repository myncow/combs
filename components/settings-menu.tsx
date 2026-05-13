"use client";

import Link from "next/link";
import { Monitor, Moon, Settings as SettingsIcon, Shield, Sun } from "lucide-react";
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
          className="absolute right-0 top-full z-30 mt-1.5 w-[min(220px,92vw)] origin-top-right p-2"
        >
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
                    "inline-flex h-9 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
                </button>
              );
            })}
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
