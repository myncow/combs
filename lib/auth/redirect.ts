type SearchLike = string | { toString(): string } | null | undefined;

export function sanitizeRedirectTo(value: unknown) {
  if (typeof value !== "string") {
    return "/";
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed || "/";
}

export function buildAuthRedirectHref(authPath: string, pathname: string, search?: SearchLike) {
  const rawSearch = typeof search === "string" ? search : search?.toString() ?? "";
  const normalizedSearch = rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch;
  const redirectTo = `${pathname}${normalizedSearch ? `?${normalizedSearch}` : ""}`;

  return `${authPath}?redirectTo=${encodeURIComponent(redirectTo)}`;
}
