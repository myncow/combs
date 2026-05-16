/** Google Images via SerpApi — set `SERPAPI_API_KEY` or `SERP_API_KEY` in `.env.local` (never commit). */
export const SERPAPI_SEARCH_JSON = "https://serpapi.com/search.json";

export type ExampleImageHit = {
  title?: string;
  link: string;
  thumbnail?: string;
  source?: string;
};

const QUERY_MIN = 2;
export const EXAMPLE_IMAGE_QUERY_MAX = 200;
const CAP = 5;

type SerpImageRow = {
  title?: string;
  link?: string;
  thumbnail?: string;
  original?: string;
  source?: string;
};

type SerpJson = {
  error?: string;
  images_results?: SerpImageRow[];
};

export function getSerpApiKey(): string | null {
  const k = process.env.SERPAPI_API_KEY ?? process.env.SERP_API_KEY;
  return k?.trim() ? k.trim() : null;
}

export function normalizeExampleImageQuery(raw: string): string | null {
  const q = raw.trim().replace(/\s+/g, " ").slice(0, EXAMPLE_IMAGE_QUERY_MAX);
  if (q.length < QUERY_MIN) {
    return null;
  }
  return q;
}

export function buildSerpGoogleImagesUrl(query: string, apiKey: string): URL {
  const url = new URL(SERPAPI_SEARCH_JSON);
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  return url;
}

export async function fetchGoogleImageExampleResults(query: string, options?: { signal?: AbortSignal }): Promise<{
  results: ExampleImageHit[];
  upstreamError?: string;
}> {
  const apiKey = getSerpApiKey();
  if (!apiKey) {
    return { results: [], upstreamError: "not_configured" };
  }

  const url = buildSerpGoogleImagesUrl(query, apiKey);
  const timeoutSignal = AbortSignal.timeout(15_000);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  const res = await fetch(url, { cache: "no-store", signal });

  if (!res.ok) {
    // Differentiate hard quota / auth failures from transient blips so callers
    // can open a circuit and skip further SerpApi work for the rest of the
    // generation instead of retrying into a depleted budget.
    if (res.status === 429) {
      return { results: [], upstreamError: "rate_limited" };
    }
    if (res.status === 403 || res.status === 401) {
      return { results: [], upstreamError: "auth_failed" };
    }
    return { results: [], upstreamError: `http_${res.status}` };
  }

  const data = (await res.json()) as SerpJson;
  if (data.error) {
    const lowered = data.error.toLowerCase();
    if (lowered.includes("exhausted") || lowered.includes("plan limit")) {
      return { results: [], upstreamError: "quota_exceeded" };
    }
    return { results: [], upstreamError: data.error };
  }

  const rows = data.images_results ?? [];
  const results: ExampleImageHit[] = [];
  for (const row of rows) {
    if (!row.link) {
      continue;
    }
    // SerpApi sometimes omits `thumbnail` (CORS/CDN scrape failure) while still
    // returning `original` (the full image URL). Coalesce so the row remains
    // renderable instead of silently dropping out of the downstream filter.
    const thumbnail = row.thumbnail ?? row.original;
    if (!thumbnail) {
      continue;
    }
    results.push({
      title: row.title,
      link: row.link,
      thumbnail,
      source: row.source,
    });
    if (results.length >= CAP) {
      break;
    }
  }

  return { results };
}
