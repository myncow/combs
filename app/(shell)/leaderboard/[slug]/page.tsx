import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { getLeaderboardEntryBySlug } from "@/lib/store";
import { PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
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
    <ShellPage size="detail" className="gap-6">
      <Link
        href="/leaderboard"
        className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Back to top list
      </Link>

      <PageHeader
        index="03"
        eyebrow={entry.topicFamily}
        title={entry.storyTitle}
        intro={entry.storySummary}
        summary={`Source cell · ${entry.cellLabel}`}
        titleClassName="text-[30px] md:text-[42px]"
      />

      <SurfacePanel className="grid gap-0 p-0 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="overflow-hidden border-b border-border bg-muted lg:border-b-0 lg:border-r">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.imageUrl}
            alt={entry.storyTitle}
            referrerPolicy="no-referrer"
            className="aspect-[4/3] h-full w-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-6 p-5 md:p-6">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">{entry.topicFamily}</Badge>
              <Badge variant="muted">{entry.mapTitle}</Badge>
            </div>
            <div className="border-t border-border pt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Source cell</p>
              <p className="mt-2 text-[15px] font-medium text-foreground">{entry.cellLabel}</p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {coordinatesLabel(entry.coordinatesSnapshot)}
              </p>
              <div className="mt-4">
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/maps/${entry.mapSlug}#map-cell-${entry.cellId}`}>View source map</Link>
                </Button>
              </div>
            </div>
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
      </SurfacePanel>
    </ShellPage>
  );
}
