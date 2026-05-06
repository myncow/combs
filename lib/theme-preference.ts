export const THEME_STORAGE_KEY = "raster-theme";

export type ThemePreference = "light" | "dark" | "system";

function isThemePreference(v: string | undefined): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

/** Cookie value for `next/headers` / `document.cookie` (non-HTTP-only). */
export function parseThemeCookie(raw: string | undefined): ThemePreference | undefined {
  return isThemePreference(raw) ? raw : undefined;
}

export function applyThemePreference(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  let dark = false;
  if (pref === "dark") dark = true;
  else if (pref === "light") dark = false;
  else {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  document.documentElement.classList.toggle("dark", dark);
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(raw ?? undefined)) return raw as ThemePreference;
  } catch {
    /* private mode */
  }
  return "system";
}

export function resolvedThemeIsDark(): boolean {
  if (typeof document === "undefined") return false;
  if (document.documentElement.classList.contains("dark")) return true;
  const pref = readStoredThemePreference();
  if (pref === "light") return false;
  if (pref === "dark") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Mirrors preference to a cookie so SSR can set `class="dark"` on `<html>`. */
export function persistThemeCookie(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_STORAGE_KEY}=${pref}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}
