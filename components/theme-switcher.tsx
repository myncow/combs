"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyThemePreference,
  persistThemeCookie,
  readStoredThemePreference,
  resolvedThemeIsDark,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme-preference";

type ThemeSwitcherProps = {
  /** Matches SSR `<html class>` / theme cookie so first paint hydrates cleanly. */
  initialPreference: ThemePreference;
  initialResolvedDark: boolean;
};

type ThemeSnapshot = {
  resolvedDark: boolean;
  storedPreference: ThemePreference;
};

let clientSnapshot: ThemeSnapshot = {
  resolvedDark: false,
  storedPreference: "system",
};

function computeSnapshot(): ThemeSnapshot {
  return {
    resolvedDark: resolvedThemeIsDark(),
    storedPreference: readStoredThemePreference(),
  };
}

function getClientSnapshot(): ThemeSnapshot {
  const next = computeSnapshot();
  if (
    next.resolvedDark !== clientSnapshot.resolvedDark ||
    next.storedPreference !== clientSnapshot.storedPreference
  ) {
    clientSnapshot = next;
  }
  return clientSnapshot;
}

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

let mqCleanup: (() => void) | undefined;
let obsCleanup: (() => void) | undefined;
let storageCleanup: (() => void) | undefined;

function ensureSubscribed() {
  if (mqCleanup) return;

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onMq = () => {
    if (readStoredThemePreference() === "system") applyThemePreference("system");
    emit();
  };
  mq.addEventListener("change", onMq);
  mqCleanup = () => mq.removeEventListener("change", onMq);

  const obs = new MutationObserver(emit);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  obsCleanup = () => obs.disconnect();

  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  storageCleanup = () => window.removeEventListener("storage", onStorage);
}

function unsubscribeAll() {
  mqCleanup?.();
  obsCleanup?.();
  storageCleanup?.();
  mqCleanup = undefined;
  obsCleanup = undefined;
  storageCleanup = undefined;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  ensureSubscribed();
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) unsubscribeAll();
  };
}

/**
 * Fixed bottom-left: single 32×32 toggle — light ⟷ dark. Shift+click → match system.
 */
export function ThemeSwitcher({
  initialPreference,
  initialResolvedDark,
}: ThemeSwitcherProps) {
  const serverSnapshot = useMemo(
    () =>
      ({
        resolvedDark: initialResolvedDark,
        storedPreference: initialPreference,
      }) satisfies ThemeSnapshot,
    [initialPreference, initialResolvedDark],
  );

  const { resolvedDark, storedPreference } = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    () => serverSnapshot,
  );

  const persist = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    persistThemeCookie(next);
    applyThemePreference(next);
    emit();
  }, []);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      persist("system");
      return;
    }
    persist(resolvedDark ? "light" : "dark");
  };

  const title =
    storedPreference === "system"
      ? "Using system appearance. Click: dark. Shift+click: system."
      : resolvedDark
        ? "Dark. Click: light. Shift+click: system."
        : "Light. Click: dark. Shift+click: system.";

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-4 left-4 z-50",
        "max-md:bottom-[max(1rem,env(safe-area-inset-bottom))] max-md:left-[max(1rem,env(safe-area-inset-left))]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={resolvedDark ? "Switch to light theme" : "Switch to dark theme"}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center border border-border bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm",
          "transition-colors duration-150 hover:border-primary hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {resolvedDark ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </div>
  );
}
