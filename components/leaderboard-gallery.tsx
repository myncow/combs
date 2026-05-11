"use client";

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeaderboardShareActions } from "@/components/leaderboard-share-actions";
import { LeaderboardVoteControls } from "@/components/leaderboard-vote-controls";
import type { ListedLeaderboardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatCoordinates(coords: Record<string, string>) {
  return Object.entries(coords)
    .map(([, value]) => value)
    .join(" · ");
}

export function LeaderboardGallery({
  entries,
  pageStart,
}: {
  entries: ListedLeaderboardEntry[];
  pageStart: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSlug = searchParams.get("spotlight");

  const activeEntry = useMemo(
    () => (activeSlug ? entries.find((entry) => entry.slug === activeSlug) ?? null : null),
    [activeSlug, entries],
  );

  const openSpotlight = useCallback(
    (slug: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("spotlight", slug);
      router.replace(`/leaderboard?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeSpotlight = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("spotlight");
    const qs = next.toString();
    router.replace(qs ? `/leaderboard?${qs}` : "/leaderboard", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!activeEntry) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSpotlight();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [activeEntry, closeSpotlight]);

  if (!entries.length) return null;

  return (
    <>
      <ul className="grid gap-4">
        {entries.map((entry, index) => {
          const rank = pageStart + index;
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => openSpotlight(entry.slug)}
                className="group flex w-full items-stretch gap-0 border border-border bg-card text-left transition-colors duration-150 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-haspopup="dialog"
              >
                <div className="relative w-[42%] shrink-0 overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.imageUrl}
                    alt={entry.storyTitle}
                    referrerPolicy="no-referrer"
                    className="aspect-[4/3] h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="absolute left-3 top-3 border border-foreground bg-foreground px-2 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-background tabular-nums">
                    #{String(rank).padStart(2, "0")}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="accent">{entry.topicFamily}</Badge>
                    <Badge variant="muted">{entry.mapTitle}</Badge>
                  </div>
                  <h2 className="font-sans text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
                    {entry.storyTitle}
                  </h2>
                  <p className="line-clamp-2 text-[14px] leading-[1.5] text-muted-foreground">
                    {entry.storySummary}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Score <span className="text-foreground tabular-nums">{entry.score}</span>
                      <span className="mx-2">·</span>
                      {entry.cellLabel}
                    </p>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground transition-colors group-hover:text-primary">
                      View
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {activeEntry ? (
        <SpotlightModal entry={activeEntry} onClose={closeSpotlight} />
      ) : null}
    </>
  );
}

function SpotlightModal({
  entry,
  onClose,
}: {
  entry: ListedLeaderboardEntry;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry.storyTitle}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[color:color-mix(in_srgb,var(--foreground)_58%,transparent)] p-4 md:items-center"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full max-w-4xl border border-border bg-background shadow-2xl",
          "my-4 md:my-0",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          aria-label="Close spotlight"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="grid gap-0 md:grid-cols-[1.35fr_1fr]">
          <div className="overflow-hidden border-b border-border bg-muted md:border-b-0 md:border-r">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.imageUrl}
              alt={entry.storyTitle}
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain md:max-h-[80vh]"
            />
          </div>
          <div className="flex flex-col gap-5 p-5 md:p-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">{entry.topicFamily}</Badge>
              <Badge variant="muted">{entry.mapTitle}</Badge>
            </div>
            <h2 className="font-sans text-[24px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[28px]">
              {entry.storyTitle}
            </h2>
            <p className="text-[15px] leading-[1.6] text-muted-foreground">{entry.storySummary}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {entry.cellLabel}
              {Object.keys(entry.coordinatesSnapshot).length
                ? ` · ${formatCoordinates(entry.coordinatesSnapshot)}`
                : ""}
            </p>
            <LeaderboardVoteControls
              slug={entry.slug}
              score={entry.score}
              upvotes={entry.upvotes}
              downvotes={entry.downvotes}
              viewerVote={entry.viewerVote ?? null}
            />
            <LeaderboardShareActions
              slug={entry.slug}
              title={entry.storyTitle}
              summary={entry.storySummary}
              mapTitle={entry.mapTitle}
              imageUrl={entry.imageUrl}
            />
            <Button asChild variant="secondary" size="sm" className="self-start">
              <Link href={`/maps/${entry.mapSlug}#map-cell-${entry.cellId}`} onClick={onClose}>
                View source map
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
