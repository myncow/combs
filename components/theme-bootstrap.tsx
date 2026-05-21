"use client";

import { useInsertionEffect } from "react";
import {
  applyAccentTheme,
  applyThemePreference,
  persistAccentCookie,
  persistThemeCookie,
  readStoredAccentTheme,
  readStoredThemePreference,
} from "@/lib/theme-preference";

/**
 * Applies stored theme + accent before paint (no inline `<script>` — React 19
 * warns on script in the tree). Cookies are kept in sync so SSR can pre-set
 * `<html class="dark" data-theme="…">` on later navigations.
 */
export function ThemeBootstrap() {
  useInsertionEffect(() => {
    const pref = readStoredThemePreference();
    applyThemePreference(pref);
    persistThemeCookie(pref);

    const accent = readStoredAccentTheme();
    applyAccentTheme(accent);
    persistAccentCookie(accent);
  }, []);
  return null;
}
