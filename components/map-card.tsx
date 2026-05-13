import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import Link from "next/link";
import { DeleteMapButton } from "@/components/delete-map-button";
import { Spinner } from "@/components/ui/spinner";
import { entryTransition } from "@/lib/motion";
import type { SavedMap } from "@/lib/types";
import { cn, pickMapThumbnail, simplifyMapDisplayTitle } from "@/lib/utils";

/**
 * Heuristic window after publish during which we still show the
 * "Searching examples…" indicator on a card. SerpAPI enrichment writes
 * patches to the row for up to ~200s (see PUBLISHED_MAX_MS in the SSE
 * events route) — 120s catches the common case without lingering.
 */
export const ENRICHMENT_WINDOW_MS = 120_000;

/** Shared so the sidebar can decide whether to keep polling. */
export function isMapEnriching(map: SavedMap, now: number = Date.now()): boolean {
  if (map.status !== "published" || !map.publishedAt) return false;
  return now - new Date(map.publishedAt).getTime() < ENRICHMENT_WINDOW_MS;
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Synthetic mini-grid — used when the map has no persisted imagery yet.
 * A 3×3 mosaic of hatched + filled + accented cells, matching the theme.
 * No SVG pattern ids — all CSS so multiple instances compose safely.
 */
function SyntheticGridPlaceholder({ className }: { className?: string }) {
  const kinds: Array<"hatch" | "fill" | "accent"> = [
    "hatch", "fill",   "hatch",
    "fill",  "accent", "hatch",
    "hatch", "fill",   "hatch",
  ];
  return (
    <div
      aria-hidden
      className={cn(
        "grid shrink-0 grid-cols-3 gap-px border border-border bg-border",
        className,
      )}
    >
      {kinds.map((kind, idx) => (
        <div
          key={idx}
          className={cn(
            "bg-background",
            kind === "fill" && "bg-[color:color-mix(in_srgb,var(--foreground)_14%,transparent)]",
            kind === "accent" && "bg-[color:color-mix(in_srgb,var(--primary)_28%,transparent)]",
            kind === "hatch" &&
              "bg-[repeating-linear-gradient(135deg,transparent_0_2px,color-mix(in_srgb,var(--foreground)_20%,transparent)_2px_3px)]",
          )}
        />
      ))}
    </div>
  );
}

function MapThumbnail({
  url,
  className,
}: {
  url: string | null | undefined;
  className?: string;
}) {
  if (!url) {
    return <SyntheticGridPlaceholder className={className} />;
  }
  return (
    <div
      aria-hidden
      className={cn(
        "shrink-0 overflow-hidden border border-border bg-muted",
        className,
      )}
    >
      {/* Remote thumbnail URL: native img (unbounded hosts), not next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

/**
 * Hairline index row: [thumbnail] [title + topic family] [date].
 * Title anchor is the a11y label; thumbnail is decorative.
 */
export function MapCard({
  map,
  allowDelete = false,
  compact = false,
  onDeleted,
}: {
  map: SavedMap;
  /** @deprecated kept for call-site compatibility; the index no longer numbers rows. */
  index?: number;
  allowDelete?: boolean;
  /** Tighter row for sidebars / narrow rails. */
  compact?: boolean;
  onDeleted?: (slug: string) => void;
}) {
  const date = formatShortDate(map.createdAt);
  const thumbnailUrl = map.thumbnailUrl ?? pickMapThumbnail(map.document);
  const displayTitle = simplifyMapDisplayTitle(map.title, map.topicFamily);

  const isGenerating = map.status === "generating";
  const hasFailed = map.status === "failed";
  // Heuristic: while the map row's `status` flips to "published" the moment
  // the grid is built, SerpAPI enrichment (reference images, anchor
  // verification, gap probing) keeps running in the background for up to
  // ~200s. Without a dedicated enrichment-completed column we use a time
  // window after `publishedAt` to keep showing the "still working" hint.
  const isEnriching =
    !!map.publishedAt &&
    map.status === "published" &&
    Date.now() - new Date(map.publishedAt).getTime() < ENRICHMENT_WINDOW_MS;
  const showActivityBar = isGenerating || isEnriching;

  if (compact) {
    return (
      <article
        className={cn(
          "group relative flex flex-col px-1 py-1",
          isGenerating && "bg-[color:color-mix(in_srgb,var(--primary)_5%,transparent)]",
        )}
      >
        <div className="flex items-center gap-2">
          <Link
            href={`/maps/${map.slug}`}
            aria-label={`Open map ${map.title}`}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 px-1.5 py-1.5 outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] focus-visible:outline-none",
              isGenerating && "border-l-2 border-primary/60 pl-2",
            )}
          >
            <MapThumbnail url={thumbnailUrl} className="h-12 w-12" />
            <div className="min-w-0 text-left">
              <h3
                title={displayTitle}
                className="text-[13.5px] font-semibold leading-[1.25] tracking-[-0.005em] text-foreground transition-colors duration-150 group-hover:text-primary [overflow-wrap:anywhere]"
              >
                {displayTitle}
              </h3>
              {date ? (
                <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <time dateTime={map.createdAt}>{date}</time>
                </p>
              ) : null}
              <AnimatePresence mode="wait" initial={false}>
                {isGenerating ? (
                  <motion.p
                    key="generating"
                    className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={entryTransition()}
                  >
                    <Spinner size="xs" className="text-primary" />
                    Generating…
                  </motion.p>
                ) : isEnriching ? (
                  <motion.p
                    key="enriching"
                    className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={entryTransition()}
                  >
                    <span
                      aria-hidden
                      className="search-glow inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-[color:color-mix(in_srgb,var(--primary)_22%,var(--background))] text-primary"
                    >
                      <Search className="h-2.5 w-2.5" strokeWidth={2.5} />
                    </span>
                    Searching examples…
                  </motion.p>
                ) : hasFailed ? (
                  <motion.p
                    key="failed"
                    className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--destructive)]"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={entryTransition()}
                  >
                    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--destructive)]" />
                    Failed
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </div>
          </Link>
          {allowDelete ? (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <DeleteMapButton slug={map.slug} title={map.title} onDeleted={onDeleted} />
            </div>
          ) : null}
        </div>
        {showActivityBar ? (
          <div
            aria-hidden
            className={cn(
              "viz-loading-track mx-1.5 mb-0.5 rounded-none",
              isGenerating ? "h-[1.5px] opacity-80" : "h-[1px] opacity-55",
            )}
          >
            <div className="viz-loading-bar h-full" />
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article className="group flex items-center gap-4 py-3">
      <Link
        href={`/maps/${map.slug}`}
        aria-label={map.title}
        className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        tabIndex={-1}
      >
        <MapThumbnail url={thumbnailUrl} className="h-12 w-12" />
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/maps/${map.slug}`} className="block">
          <h3 className="truncate text-[16px] font-semibold leading-[1.3] tracking-[-0.005em] text-foreground transition-colors duration-150 group-hover:text-primary">
            {displayTitle}
          </h3>
          <p className="mt-0.5 truncate font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
            {map.topicFamily}
            {map.createdByDisplayName ? <> · by {map.createdByDisplayName}</> : null}
          </p>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <time dateTime={map.createdAt} className="font-mono text-[12px] tabular-nums text-muted-foreground">
          {date}
        </time>
      </div>
    </article>
  );
}
