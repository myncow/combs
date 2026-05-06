"use client";

import { useInsertionEffect } from "react";
import {
  applyThemePreference,
  persistThemeCookie,
  readStoredThemePreference,
} from "@/lib/theme-preference";

/**
 * Applies stored theme before paint (no inline `<script>` — React 19 warns on script in the tree).
 * Cookie is kept in sync for SSR on later navigations.
 */
export function ThemeBootstrap() {
  useInsertionEffect(() => {
    const pref = readStoredThemePreference();
    applyThemePreference(pref);
    persistThemeCookie(pref);
  }, []);
  return null;
}
