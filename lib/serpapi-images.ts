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
const CAP = 8;

type SerpImageRow = {
  title?: string;
  link?: string;
  thumbnail?: string;
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
  const res = await fetch(url, { cache: "no-store", signal: options?.signal });

  if (!res.ok) {
    return { results: [], upstreamError: `http_${res.status}` };
  }

  const data = (await res.json()) as SerpJson;
  if (data.error) {
    return { results: [], upstreamError: data.error };
  }

  const rows = data.images_results ?? [];
  const results: ExampleImageHit[] = [];
  for (const row of rows) {
    if (!row.link) {
      continue;
    }
    results.push({
      title: row.title,
      link: row.link,
      thumbnail: row.thumbnail,
      source: row.source,
    });
    if (results.length >= CAP) {
      break;
    }
  }

  return { results };
}
