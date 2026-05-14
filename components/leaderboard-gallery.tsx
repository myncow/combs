"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LeaderboardComments } from "@/components/leaderboard-comments";
import { LeaderboardEntryEditor } from "@/components/leaderboard-entry-editor";
import { LeaderboardShareActions } from "@/components/leaderboard-share-actions";
import { LeaderboardVoteControls } from "@/components/leaderboard-vote-controls";
import { labelForImageModelId } from "@/lib/image-model-options";
import type { ListedLeaderboardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

function entryAnchorId(slug: string) {
  return `spotlight-${slug}`;
}

function commentsAnchorId(slug: string) {
  return `comments-${slug}`;
}

function viewerCanEdit(
  entry: ListedLeaderboardEntry,
  viewerId?: string | null,
  viewerIsAdmin?: boolean,
): boolean {
  if (viewerIsAdmin) return true;
  if (!viewerId) return false;
  return entry.mapOwnerId === viewerId;
}

export function LeaderboardGallery({
  entries,
  view = "gallery",
  isSignedIn = false,
  viewerId = null,
  viewerIsAdmin = false,
}: {
  entries: ListedLeaderboardEntry[];
  view?: "list" | "gallery";
  /**
   * Voting is gated by auth on the server; signed-out clicks bounce to
   * /auth/sign-in via the vote-controls component instead of mutating.
   */
  isSignedIn?: boolean;
  /** Neon user id of the current viewer (drives "can edit" gating). */
  viewerId?: string | null;
  viewerIsAdmin?: boolean;
}) {
  const searchParams = useSearchParams();
  // Backward compat: existing share links still use `?spotlight=<slug>`.
  const focusedSlug = searchParams.get("spotlight");
  const listContainerRef = useRef<HTMLTableSectionElement>(null);
  const galleryContainerRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!focusedSlug) return;
    const root = listContainerRef.current ?? galleryContainerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
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
      <div className="-mx-5 border-y border-border bg-card md:-mx-8">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[64px] md:w-[72px]">Entry</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden w-[180px] md:table-cell">Score</TableHead>
              <TableHead className="w-[180px] text-right md:w-[220px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody ref={listContainerRef}>
            {entries.map((entry) => {
              const commentCount = entry.commentCount ?? 0;
              const expandHref = `/?view=gallery&spotlight=${encodeURIComponent(entry.slug)}`;
              const commentsHref = `${expandHref}#${commentsAnchorId(entry.slug)}`;
              return (
                <TableRow
                  key={entry.id}
                  id={entryAnchorId(entry.slug)}
                  className="scroll-mt-6"
                >
                  <TableCell>
                    <Link
                      href={expandHref}
                      aria-label={`Expand ${entry.storyTitle}`}
                      className="block aspect-square h-12 w-12 overflow-hidden border border-border bg-muted md:h-14 md:w-14"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.imageUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <h3 className="truncate font-sans text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground md:text-[16px]">
                        <Link
                          href={expandHref}
                          className="transition-colors hover:text-primary"
                        >
                          {entry.storyTitle}
                        </Link>
                      </h3>
                      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {entry.topicFamily}
                        {entry.createdByDisplayName ? (
                          <>
                            <span className="mx-1.5 text-muted-foreground/50">·</span>
                            <span className="normal-case tracking-normal">
                              by {entry.createdByDisplayName}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <LeaderboardVoteControls
                      slug={entry.slug}
                      score={entry.score}
                      upvotes={entry.upvotes}
                      downvotes={entry.downvotes}
                      viewerVote={entry.viewerVote ?? null}
                      compact
                      isSignedIn={isSignedIn}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={commentsHref}
                            aria-label={`View ${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
                            className={cn(
                              "inline-flex h-8 items-center gap-1.5 border border-border bg-card px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "hover:[&_svg]:fill-[color:color-mix(in_srgb,var(--primary)_15%,transparent)]",
                            )}
                          >
                            <MessageSquare className="h-3 w-3" aria-hidden strokeWidth={1.75} />
                            <span className="tabular-nums">{commentCount}</span>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>View comments</TooltipContent>
                      </Tooltip>
                      <Button asChild variant="secondary" size="sm">
                        <Link
                          href={expandHref}
                          aria-label={`Expand ${entry.storyTitle}`}
                        >
                          Expand
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <ul ref={galleryContainerRef} className="grid gap-5">
      {entries.map((entry) => {
        const canEdit = viewerCanEdit(entry, viewerId, viewerIsAdmin);
        const sourceHref = `/maps/${entry.mapSlug}#map-cell-${entry.cellId}`;
        return (
          <li
            key={entry.id}
            id={entryAnchorId(entry.slug)}
            className={cn(
              "scroll-mt-6 border border-border bg-card transition-shadow duration-300",
              "data-[focused=true]:shadow-[0_0_0_2px_var(--primary)]",
            )}
          >
            <div className="grid gap-0 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="relative overflow-hidden border-b border-border bg-muted md:border-b-0 md:border-r">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.imageUrl}
                  alt={entry.storyTitle}
                  referrerPolicy="no-referrer"
                  className="block h-full max-h-[78vh] w-full object-contain"
                />
                {entry.imageModel ? (
                  <div
                    className="pointer-events-none absolute bottom-2 left-2 max-w-[min(100%,15rem)] border border-border/60 bg-background/85 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground shadow-sm backdrop-blur-sm"
                    title={entry.imageModel}
                  >
                    {labelForImageModelId(entry.imageModel)}
                  </div>
                ) : null}
                <LeaderboardShareActions
                  variant="icons"
                  slug={entry.slug}
                  title={entry.storyTitle}
                  summary={entry.storySummary}
                  mapTitle={entry.mapTitle}
                  imageUrl={entry.imageUrl}
                  sourceHref={sourceHref}
                  className="absolute bottom-2 right-2"
                />
              </div>
              <div className="flex min-h-0 flex-col">
                <div className="flex flex-col gap-3 p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 font-sans text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[26px]">
                      {entry.storyTitle}
                    </h2>
                    {canEdit ? (
                      <LeaderboardEntryEditor
                        slug={entry.slug}
                        storyTitle={entry.storyTitle}
                        storySummary={entry.storySummary}
                      />
                    ) : null}
                  </div>
                  <p className="font-sans text-[14px] leading-[1.55] text-muted-foreground">
                    {entry.storySummary}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span>{entry.topicFamily}</span>
                    {entry.createdByDisplayName ? (
                      <>
                        <span aria-hidden className="text-muted-foreground/50">·</span>
                        <span className="normal-case tracking-normal">
                          by {entry.createdByDisplayName}
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden className="text-muted-foreground/50">·</span>
                    <Link
                      href={sourceHref}
                      className="inline-flex items-center gap-1 normal-case tracking-normal text-foreground transition-colors hover:text-primary"
                    >
                      from {entry.mapTitle}
                      <ArrowUpRight className="h-3 w-3" aria-hidden strokeWidth={1.75} />
                    </Link>
                  </p>
                  <LeaderboardVoteControls
                    slug={entry.slug}
                    score={entry.score}
                    upvotes={entry.upvotes}
                    downvotes={entry.downvotes}
                    viewerVote={entry.viewerVote ?? null}
                    compact
                    isSignedIn={isSignedIn}
                  />
                </div>
                <section
                  id={commentsAnchorId(entry.slug)}
                  aria-label={`Comments on ${entry.storyTitle}`}
                  className="scroll-mt-6 border-t border-border md:max-h-[44vh] md:overflow-y-auto"
                >
                  <LeaderboardComments
                    slug={entry.slug}
                    initialCount={entry.commentCount ?? 0}
                    isSignedIn={isSignedIn}
                    viewerId={viewerId}
                    viewerIsAdmin={viewerIsAdmin}
                  />
                </section>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
