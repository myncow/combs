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

function formatCoordinates(coords: Record<string, string>) {
  return Object.entries(coords)
    .map(([, value]) => value)
    .join(" · ");
}

function spotlightAnchorId(slug: string) {
  return `spotlight-${slug}`;
}

export function LeaderboardGallery({
  entries,
}: {
  entries: ListedLeaderboardEntry[];
}) {
  const searchParams = useSearchParams();
  const focusedSlug = searchParams.get("spotlight");
  const containerRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!focusedSlug || !containerRef.current) return;
    const target = containerRef.current.querySelector<HTMLElement>(`#${CSS.escape(spotlightAnchorId(focusedSlug))}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.dataset.focused = "true";
    const timer = window.setTimeout(() => {
      delete target.dataset.focused;
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [focusedSlug]);

  if (!entries.length) return null;

  return (
    <ul ref={containerRef} className="grid gap-5">
      {entries.map((entry) => (
        <li
          key={entry.id}
          id={spotlightAnchorId(entry.slug)}
          className="scroll-mt-6 border border-border bg-card transition-shadow duration-300 data-[focused=true]:shadow-[0_0_0_2px_var(--primary)]"
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent">{entry.topicFamily}</Badge>
                <Badge variant="muted">{entry.mapTitle}</Badge>
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
