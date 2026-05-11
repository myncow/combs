"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn, exampleHasImageQuery, googleImagesSearchUrl } from "@/lib/utils";

const DISPLAY = 4;
const MATRIX_DISPLAY = 8;

export type ExampleImageHit = { title?: string; link: string; thumbnail?: string; source?: string };

/** Renders persisted SERP thumbnails only (no fetch). */
export function PersistedReferenceThumbnails({
  images,
  className,
  compact = false,
}: {
  images: ExampleImageHit[];
  className?: string;
  compact?: boolean;
}) {
  const list = images.filter((h) => h.thumbnail && h.link).slice(0, 4);
  if (!list.length) {
    return null;
  }
  return (
    <div
      className={cn(
        "grid gap-1",
        compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
        className,
      )}
    >
      {list.map((h) => (
        <a
          key={h.link}
          href={h.link}
          target="_blank"
          rel="noopener noreferrer"
          className="relative aspect-square w-full overflow-hidden border border-border bg-muted outline-none ring-offset-background transition-colors duration-150 hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring"
          title={h.title ?? h.source ?? ""}
        >
          {/* Remote SERP thumb: native img for arbitrary hosts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={h.thumbnail!} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

export type ExampleVisualMatrixItem = {
  id?: string;
  name: string;
  brand?: string;
  year?: string;
  evidenceNote?: string;
  query: string;
};

type MatrixTile = ExampleVisualMatrixItem & {
  hit?: ExampleImageHit;
};

async function fetchExampleImages(query: string, signal: AbortSignal): Promise<ExampleImageHit[]> {
  const res = await fetch(`/api/example-images?q=${encodeURIComponent(query)}`, { signal });
  if (res.status === 503 || !res.ok) {
    return [];
  }
  const data = (await res.json()) as { results?: ExampleImageHit[] };
  return (data.results ?? []).filter((h) => h.thumbnail && h.link);
}

export function ExampleImageThumbnails({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  const q = query.trim();
  const [hits, setHits] = useState<ExampleImageHit[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    fetchExampleImages(q, ac.signal)
      .then((results) => {
        const list = results.slice(0, DISPLAY);
        if (!list.length || ac.signal.aborted) {
          return;
        }
        setHits(list);
      })
      .catch(() => {
        /* abort or network */
      });
    return () => ac.abort();
  }, [q]);

  if (!hits.length) {
    return null;
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-4 gap-1">
        {hits.map((h) => (
          <a
            key={h.link}
            href={h.link}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-square w-full overflow-hidden border border-border bg-muted outline-none ring-offset-background transition-colors duration-150 hover:border-foreground focus-visible:ring-2 focus-visible:ring-ring"
            title={h.title ?? h.source ?? ""}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={h.thumbnail!}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

export function ExampleVisualMatrix({
  items,
  className,
  compact = false,
}: {
  items: ExampleVisualMatrixItem[];
  className?: string;
  compact?: boolean;
}) {
  const fetchableItems = useMemo(
    () =>
      items
        .map((item) => ({ ...item, query: item.query.trim() }))
        .filter((item) => item.name.trim().length > 0 && exampleHasImageQuery(item.query))
        .slice(0, MATRIX_DISPLAY),
    [items],
  );
  const fetchableKey = fetchableItems
    .map((item) => `${item.name}\u0000${item.brand ?? ""}\u0000${item.year ?? ""}\u0000${item.query}`)
    .join("\u0001");
  const [matrixState, setMatrixState] = useState<{ key: string; tiles: MatrixTile[] }>({
    key: "",
    tiles: [],
  });

  useEffect(() => {
    if (!fetchableItems.length) {
      return;
    }

    const ac = new AbortController();
    Promise.all(
      fetchableItems.map(async (item) => {
        const [hit] = await fetchExampleImages(item.query, ac.signal);
        return { ...item, hit };
      }),
    )
      .then((nextTiles) => {
        if (ac.signal.aborted) {
          return;
        }
        setMatrixState({ key: fetchableKey, tiles: nextTiles });
      })
      .catch(() => {
        if (!ac.signal.aborted) {
          setMatrixState({ key: fetchableKey, tiles: [] });
        }
      });

    return () => ac.abort();
  }, [fetchableItems, fetchableKey]);

  const tiles = matrixState.key === fetchableKey ? matrixState.tiles : [];
  const loading = fetchableItems.length > 0 && matrixState.key !== fetchableKey;
  const visibleTiles = tiles.filter((tile) => tile.hit?.thumbnail && tile.hit.link);

  if (!fetchableItems.length) {
    return null;
  }

  if (loading && !visibleTiles.length) {
    return (
      <div
        className={cn(
          "grid grid-cols-2 gap-px border border-border bg-border",
          compact ? "md:grid-cols-2" : "sm:grid-cols-4",
          className,
        )}
      >
        {fetchableItems.slice(0, compact ? 4 : 6).map((item, index) => (
          <div
            key={`${item.query}-${index}`}
            className={cn(
              "min-h-28 animate-pulse bg-muted/45",
              !compact && index === 0 ? "sm:col-span-2 sm:row-span-2 sm:min-h-56" : "",
            )}
          />
        ))}
      </div>
    );
  }

  if (!visibleTiles.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px border border-border bg-border",
        compact ? "md:grid-cols-2" : "sm:grid-cols-4",
        className,
      )}
    >
      {visibleTiles.map((tile, index) => {
        const hit = tile.hit!;
        return (
          <a
            key={`${tile.query}-${hit.link}`}
            href={hit.link}
            target="_blank"
            rel="noopener noreferrer"
            title={hit.title ?? tile.name}
            className={cn(
              "group relative isolate flex min-h-32 flex-col overflow-hidden bg-card outline-none ring-offset-background transition-colors duration-200 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "min-h-28" : "",
              !compact && index === 0 ? "sm:col-span-2 sm:row-span-2 sm:min-h-72" : "",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hit.thumbnail!}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full flex-1 border-b border-border object-cover"
            />
            <div className="space-y-2 bg-card px-3 py-3">
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span className="truncate">{tile.year ?? tile.brand ?? hit.source ?? "Visual"}</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </div>
              <div>
                <span className="block text-[14px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
                  {tile.name}
                </span>
                {tile.brand ? (
                  <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">
                    {tile.brand}
                  </span>
                ) : null}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function OpenImageSearchLink({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  const q = query.trim();
  if (!q.length) {
    return null;
  }
  return (
    <a
      href={googleImagesSearchUrl(q)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open Google Images for ${q}`}
      className={className}
    >
      Open image search
      <ExternalLink className="ml-1 inline-block h-3 w-3 shrink-0 translate-y-[1px] text-muted-foreground" />
    </a>
  );
}
