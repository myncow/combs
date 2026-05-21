export const THEME_STORAGE_KEY = "raster-theme";
export const ACCENT_STORAGE_KEY = "raster-accent";

/**
 * Same-tab notification channel for theme preference changes. The
 * `storage` event does not fire in the tab that wrote the value, and
 * watching `<html>` class mutations misses no-op transitions (e.g.
 * Light → Auto when the OS preference is already light). We dispatch
 * this event from `persistThemePreference` so subscribers re-read the
 * stored value reliably.
 */
export const THEME_CHANGE_EVENT = "raster:theme-change";
export const ACCENT_CHANGE_EVENT = "raster:accent-change";

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

/**
 * Persist a theme preference to localStorage + cookie, apply it to
 * `<html>`, and broadcast a same-tab change event. Use this from any
 * UI affordance that switches theme; subscribers will re-read.
 */
export function persistThemePreference(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* private mode */
  }
  persistThemeCookie(pref);
  applyThemePreference(pref);
  try {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: pref }));
  } catch {
    /* CustomEvent unsupported — fall back silently */
  }
}

/* ------------------------------------------------------------------ *
 * Accent palette (cobalt | graphite | moss | rust).
 *
 * Orthogonal to light/dark. Cobalt is the default and writes no
 * attribute; the others toggle `data-theme="<name>"` on <html> which
 * overrides --primary / --primary-foreground / --ring via theme.css.
 * Mirror the light/dark API so callers feel the same.
 * ------------------------------------------------------------------ */

export type AccentTheme = "cobalt" | "graphite" | "moss" | "rust";

const ACCENT_VALUES: ReadonlyArray<AccentTheme> = ["cobalt", "graphite", "moss", "rust"];

function isAccentTheme(v: string | undefined): v is AccentTheme {
  return v !== undefined && (ACCENT_VALUES as ReadonlyArray<string>).includes(v);
}

export function parseAccentCookie(raw: string | undefined): AccentTheme | undefined {
  return isAccentTheme(raw) ? raw : undefined;
}

export function applyAccentTheme(accent: AccentTheme): void {
  if (typeof document === "undefined") return;
  if (accent === "cobalt") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", accent);
  }
}

export function readStoredAccentTheme(): AccentTheme {
  if (typeof window === "undefined") return "cobalt";
  try {
    const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentTheme(raw ?? undefined)) return raw as AccentTheme;
  } catch {
    /* private mode */
  }
  return "cobalt";
}

const ACCENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function persistAccentCookie(accent: AccentTheme): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ACCENT_STORAGE_KEY}=${accent}; Path=/; Max-Age=${ACCENT_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function persistAccentTheme(accent: AccentTheme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    /* private mode */
  }
  persistAccentCookie(accent);
  applyAccentTheme(accent);
  try {
    window.dispatchEvent(new CustomEvent(ACCENT_CHANGE_EVENT, { detail: accent }));
  } catch {
    /* CustomEvent unsupported — fall back silently */
  }
}
