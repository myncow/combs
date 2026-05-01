import { appConfig } from "@/lib/config";
import type { GenerationMetricsCollector } from "@/lib/generation-metrics";
import { moderateText } from "@/lib/guards";
import { fetchGoogleImageExampleResults, getSerpApiKey, normalizeExampleImageQuery } from "@/lib/serpapi-images";
import type { MapDocument, MapExample, MapReferenceImage } from "@/lib/types";
import { exampleImageSearchQuery } from "@/lib/utils";

/** Stored hits per example; capped for persistence (4–8 range). */
export const REFERENCE_IMAGES_PER_EXAMPLE = 6;

/** Max in-flight SerpApi requests during reference enrichment (ordered queue; featured-first). */
export const REFERENCE_ENRICHMENT_MAX_CONCURRENCY = 4;

export function exampleIdentityKey(example: Pick<MapExample, "name" | "brand" | "year">): string {
  return `${example.name.trim().toLowerCase()}\u0000${(example.brand ?? "").trim().toLowerCase()}\u0000${(example.year ?? "").trim().toLowerCase()}`;
}

function normalizeHits(rows: Awaited<ReturnType<typeof fetchGoogleImageExampleResults>>["results"]): MapReferenceImage[] {
  const out: MapReferenceImage[] = [];
  for (const row of rows) {
    if (!row.link) {
      continue;
    }
    out.push({
      link: row.link,
      thumbnail: row.thumbnail,
      title: row.title,
      source: row.source,
    });
    if (out.length >= REFERENCE_IMAGES_PER_EXAMPLE) {
      break;
    }
  }
  return out;
}

function mergeLookup(document: MapDocument, hitsByKey: Map<string, MapReferenceImage[]>): MapDocument {
  const attach = (ex: MapExample): MapExample => {
    const images = hitsByKey.get(exampleIdentityKey(ex));
    if (!images?.length) {
      return ex;
    }
    return { ...ex, referenceImages: images };
  };

  return {
    ...document,
    featuredExamples: document.featuredExamples.map(attach),
    cells: document.cells.map((cell) => ({
      ...cell,
      examples: cell.examples.map(attach),
    })),
  };
}

/** Run async work over `[0,length)` indices with at most `concurrency` in flight (stable pool). */
export async function runKeyedPool(length: number, concurrency: number, worker: (index: number) => Promise<void>): Promise<void> {
  if (length === 0) {
    return;
  }

  let next = 0;
  let active = 0;
  const capped = Math.min(concurrency, length);

  await new Promise<void>((resolve, reject) => {
    const startMore = () => {
      while (active < capped && next < length) {
        const i = next++;
        active++;

        worker(i)
          .catch(reject)
          .finally(() => {
            active--;
            if (next >= length && active === 0) {
              resolve();
              return;
            }
            startMore();
          });
      }
    };

    startMore();
  });
}

/**
 * Fetches Google Images via SerpApi for unique examples (featured first, then cell examples) and merges
 * `referenceImages` onto matching examples in `cells` and `featuredExamples`.
 * Skips entirely when `SERPAPI_API_KEY`/`SERP_API_KEY` is unset. Respects `appConfig.generation.serpReferenceMaxCalls`.
 */
export async function enrichMapDocumentReferenceImages(
  document: MapDocument,
  collector?: GenerationMetricsCollector,
): Promise<MapDocument> {
  if (!getSerpApiKey() || appConfig.generation.serpReferenceMaxCalls <= 0) {
    return document;
  }

  const budget = appConfig.generation.serpReferenceMaxCalls;
  const orderedKeys: string[] = [];
  const exampleByKey = new Map<string, MapExample>();

  const consider = (ex: MapExample) => {
    if (!ex.name?.trim()) {
      return;
    }
    const qRaw = exampleImageSearchQuery(ex);
    const q = normalizeExampleImageQuery(qRaw);
    if (!q) {
      return;
    }
    const key = exampleIdentityKey(ex);
    if (exampleByKey.has(key)) {
      return;
    }
    exampleByKey.set(key, ex);
    orderedKeys.push(key);
  };

  for (const ex of document.featuredExamples) {
    consider(ex);
  }
  for (const cell of document.cells) {
    for (const ex of cell.examples) {
      consider(ex);
    }
  }

  const wall0 = Date.now();
  const hitsByKey = new Map<string, MapReferenceImage[]>();
  let serpCalls = 0;
  let memoHits = 0;

  const queryMemo = new Map<string, Promise<MapReferenceImage[]>>();

  async function resolveQuery(q: string): Promise<MapReferenceImage[]> {
    const cached = queryMemo.get(q);
    if (cached) {
      memoHits++;
      return cached;
    }

    if (serpCalls >= budget) {
      const empty = Promise.resolve([] as MapReferenceImage[]);
      queryMemo.set(q, empty);
      return empty;
    }

    serpCalls++;
    const promise = (async () => {
      const { results } = await fetchGoogleImageExampleResults(q);
      return normalizeHits(results).filter((h) => h.thumbnail && h.link);
    })();
    queryMemo.set(q, promise);
    return promise;
  }

  const n = orderedKeys.length;

  await runKeyedPool(n, REFERENCE_ENRICHMENT_MAX_CONCURRENCY, async (index) => {
    const key = orderedKeys[index];
    const ex = key ? exampleByKey.get(key) : undefined;
    if (!key || !ex) {
      return;
    }
    const qRaw = exampleImageSearchQuery(ex);
    const q = normalizeExampleImageQuery(qRaw);
    if (!q || !moderateText(q).safe) {
      return;
    }
    const hits = await resolveQuery(q);
    if (hits.length) {
      hitsByKey.set(key, hits);
    }
  });

  collector?.addReferenceImages({
    durationWallMs: Date.now() - wall0,
    serpApiCalls: serpCalls,
    concurrencyMaxObserved: Math.min(REFERENCE_ENRICHMENT_MAX_CONCURRENCY, Math.max(1, n)),
    memoHits,
  });

  if (!hitsByKey.size) {
    return document;
  }

  return mergeLookup(document, hitsByKey);
}
