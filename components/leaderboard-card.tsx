import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LeaderboardVoteControls } from "@/components/leaderboard-vote-controls";
import type { ListedLeaderboardEntry } from "@/lib/types";

function formatCoordinates(coords: Record<string, string>) {
  return Object.entries(coords)
    .map(([, value]) => value)
    .join(" · ");
}

export function LeaderboardCard({
  entry,
  rank,
  featured = false,
}: {
  entry: ListedLeaderboardEntry;
  rank?: number;
  featured?: boolean;
}) {
  return (
    <article className="border border-border bg-card">
      <div className={featured ? "grid gap-0 lg:grid-cols-[1.45fr_1fr]" : "grid gap-0 md:grid-cols-[1.2fr_0.8fr]"}>
        <div className="relative overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.imageUrl}
            alt={entry.storyTitle}
            referrerPolicy="no-referrer"
            className={featured ? "aspect-[4/3] h-full w-full object-cover" : "aspect-[16/11] h-full w-full object-cover"}
          />
          {rank ? (
            <div className="absolute left-3 top-3 border border-foreground bg-foreground px-2 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-background tabular-nums">
              #{String(rank).padStart(2, "0")}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col justify-between gap-6 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">{entry.topicFamily}</Badge>
              <Badge variant="muted">{entry.mapTitle}</Badge>
            </div>
            <h2 className={featured ? "mt-4 font-sans text-[30px] font-semibold leading-[1.02] tracking-[-0.025em] text-foreground" : "mt-4 font-sans text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground"}>
              {entry.storyTitle}
            </h2>
            <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{entry.storySummary}</p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {entry.cellLabel}
              {Object.keys(entry.coordinatesSnapshot).length ? ` · ${formatCoordinates(entry.coordinatesSnapshot)}` : ""}
            </p>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
            <LeaderboardVoteControls
              slug={entry.slug}
              score={entry.score}
              upvotes={entry.upvotes}
              downvotes={entry.downvotes}
              viewerVote={entry.viewerVote ?? null}
              compact={!featured}
            />
            <Link
              href={`/leaderboard/${entry.slug}`}
              className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.22em] text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              View spotlight
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
