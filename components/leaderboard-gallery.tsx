"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
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

function entryAnchorId(slug: string) {
  return `spotlight-${slug}`;
}

export function LeaderboardGallery({
  entries,
  view = "gallery",
}: {
  entries: ListedLeaderboardEntry[];
  view?: "list" | "gallery";
}) {
  const searchParams = useSearchParams();
  // Backward compat: existing share links still use `?spotlight=<slug>`.
  const focusedSlug = searchParams.get("spotlight");
  const containerRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!focusedSlug || !containerRef.current) return;
    const target = containerRef.current.querySelector<HTMLElement>(
      `#${CSS.escape(entryAnchorId(focusedSlug))}`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.dataset.focused = "true";
    const timer = window.setTimeout(() => {
      delete target.dataset.focused;
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [focusedSlug]);

  if (!entries.length) return null;

  if (view === "list") {
    return (
      <ul
        ref={containerRef}
        className="divide-y divide-border border border-border bg-card"
      >
        {entries.map((entry) => (
          <li
            key={entry.id}
            id={entryAnchorId(entry.slug)}
            className="scroll-mt-6 transition-colors duration-300 data-[focused=true]:bg-[color:color-mix(in_srgb,var(--primary)_8%,var(--card))]"
          >
            <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 md:grid-cols-[56px_72px_minmax(0,1fr)_auto_auto] md:gap-5 md:px-5">
              <div
                aria-label={`Score: ${entry.score}`}
                className="hidden flex-col items-center justify-center border border-border bg-card px-2 py-2 leading-none md:flex"
              >
                <span className="font-sans text-[20px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
                  {entry.score}
                </span>
                <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                  Votes
                </span>
              </div>

              {/* Expand link wraps the thumbnail so a single click jumps to
                  the gallery view focused on this entry. */}
              <Link
                href={`/?view=gallery&spotlight=${encodeURIComponent(entry.slug)}`}
                aria-label={`Expand ${entry.storyTitle}`}
                className="block aspect-square h-16 w-16 overflow-hidden border border-border bg-muted md:h-[72px] md:w-[72px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </Link>

              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="truncate">{entry.topicFamily}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{entry.mapTitle}</span>
                </div>
                <h3 className="mt-1 truncate font-sans text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground md:text-[16px]">
                  <Link
                    href={`/?view=gallery&spotlight=${encodeURIComponent(entry.slug)}`}
                    className="transition-colors hover:text-primary"
                  >
                    {entry.storyTitle}
                  </Link>
                </h3>
                <p className="mt-0.5 truncate text-[12.5px] leading-snug text-muted-foreground">
                  {entry.storySummary}
                </p>
                <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
                  {entry.cellLabel}
                  {Object.keys(entry.coordinatesSnapshot).length
                    ? ` · ${formatCoordinates(entry.coordinatesSnapshot)}`
                    : ""}
                  {entry.createdByDisplayName ? ` · by ${entry.createdByDisplayName}` : ""}
                </p>
              </div>

              <div className="hidden items-center md:flex">
                <LeaderboardVoteControls
                  slug={entry.slug}
                  score={entry.score}
                  upvotes={entry.upvotes}
                  downvotes={entry.downvotes}
                  viewerVote={entry.viewerVote ?? null}
                  compact
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={`/?view=gallery&spotlight=${encodeURIComponent(entry.slug)}`}
                    aria-label={`Expand ${entry.storyTitle}`}
                  >
                    Expand
                  </Link>
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul ref={containerRef} className="grid gap-5">
      {entries.map((entry) => (
        <li
          key={entry.id}
          id={entryAnchorId(entry.slug)}
          className={cn(
            "scroll-mt-6 border border-border bg-card transition-shadow duration-300",
            "data-[focused=true]:shadow-[0_0_0_2px_var(--primary)]",
          )}
        >
          <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
            <div className="relative overflow-hidden border-b border-border bg-muted md:border-b-0 md:border-r">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.imageUrl}
                alt={entry.storyTitle}
                referrerPolicy="no-referrer"
                className="h-full max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-5 p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="accent">{entry.topicFamily}</Badge>
                  <Badge variant="muted">{entry.mapTitle}</Badge>
                </div>
                <div
                  aria-label={`Score: ${entry.score}`}
                  className="flex shrink-0 flex-col items-end leading-none"
                >
                  <span className="font-sans text-[32px] font-semibold tabular-nums tracking-[-0.02em] text-foreground md:text-[40px]">
                    {entry.score}
                  </span>
                  <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {entry.upvotes} up · {entry.downvotes} down
                  </span>
                </div>
              </div>
              <h2 className="font-sans text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[26px]">
                {entry.storyTitle}
              </h2>
              <p className="text-[15px] leading-[1.6] text-muted-foreground">{entry.storySummary}</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {entry.cellLabel}
                {Object.keys(entry.coordinatesSnapshot).length
                  ? ` · ${formatCoordinates(entry.coordinatesSnapshot)}`
                  : ""}
                {entry.createdByDisplayName ? (
                  <>
                    <span className="mx-1.5 text-muted-foreground/60">·</span>
                    by {entry.createdByDisplayName}
                  </>
                ) : null}
              </p>
              <LeaderboardVoteControls
                slug={entry.slug}
                score={entry.score}
                upvotes={entry.upvotes}
                downvotes={entry.downvotes}
                viewerVote={entry.viewerVote ?? null}
                compact
              />
              <LeaderboardShareActions
                slug={entry.slug}
                title={entry.storyTitle}
                summary={entry.storySummary}
                mapTitle={entry.mapTitle}
                imageUrl={entry.imageUrl}
              />
              <Button asChild variant="secondary" size="sm" className="self-start">
                <Link href={`/maps/${entry.mapSlug}#map-cell-${entry.cellId}`}>
                  View source map
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
