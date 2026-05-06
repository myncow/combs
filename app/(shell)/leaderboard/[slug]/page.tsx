import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { getLeaderboardEntryBySlug } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { LeaderboardShareActions } from "@/components/leaderboard-share-actions";
import { LeaderboardVoteControls } from "@/components/leaderboard-vote-controls";

function coordinatesLabel(coords: Record<string, string>) {
  return Object.entries(coords)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getLeaderboardEntryBySlug(slug);
  if (!entry) {
    return {};
  }
  return {
    title: `${entry.storyTitle} | Top List`,
    description: entry.storySummary,
  };
}

export default async function LeaderboardEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const requesterId = await getRequesterId();
  const { slug } = await params;
  const entry = await getLeaderboardEntryBySlug(slug, requesterId);

  if (!entry) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-5 py-6 md:px-8 md:py-8">
      <Link
        href="/leaderboard"
        className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Back to top list
      </Link>

      <section className="grid gap-0 border border-border bg-card lg:grid-cols-[1.25fr_0.75fr]">
        <div className="overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.imageUrl}
            alt={entry.storyTitle}
            referrerPolicy="no-referrer"
            className="aspect-[4/3] h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-6 p-6">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">{entry.topicFamily}</Badge>
              <Badge variant="muted">{entry.mapTitle}</Badge>
            </div>
            <h1 className="mt-4 font-sans text-[34px] font-semibold leading-[0.98] tracking-[-0.03em] text-foreground">
              {entry.storyTitle}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{entry.storySummary}</p>
          </div>

          <div className="space-y-3 border-y border-border py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Source cell</p>
            <p className="text-[15px] font-medium text-foreground">{entry.cellLabel}</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {coordinatesLabel(entry.coordinatesSnapshot)}
            </p>
            <Link
              href={`/maps/${entry.mapSlug}#map-cell-${entry.cellId}`}
              className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition-colors hover:text-primary"
            >
              View source map
            </Link>
          </div>

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
        </div>
      </section>
    </main>
  );
}
