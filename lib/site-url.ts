import { readFirstEnv } from "@/lib/env";

function normalizeBaseUrl(raw: string): URL {
  const trimmed = raw.trim().replace(/\/$/, "");
  const withScheme =
    trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
  return new URL(withScheme.endsWith("/") ? withScheme.slice(0, -1) : withScheme);
}

/**
 * Canonical site origin for metadata, sitemap, and OG URLs.
 * Prefer `SITE_URL` or `NEXT_PUBLIC_SITE_URL`; then `VERCEL_URL` (no scheme).
 * Last resort: localhost for dev.
 */
export function getSiteUrl(): URL {
  const explicit = readFirstEnv(["SITE_URL", "NEXT_PUBLIC_SITE_URL", "VERCEL_URL"]);
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }
  const port = process.env.PORT ?? "3000";
  return new URL(`http://localhost:${port}`);
}

export function getSiteOrigin(): string {
  return getSiteUrl().origin;
}
