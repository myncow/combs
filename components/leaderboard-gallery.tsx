"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeaderboardComments } from "@/components/leaderboard-comments";
import { LeaderboardEntryEditor } from "@/components/leaderboard-entry-editor";
import { LeaderboardShareActions } from "@/components/leaderboard-share-actions";
import { LeaderboardVoteControls } from "@/components/leaderboard-vote-controls";
import type { ListedLeaderboardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

function entryAnchorId(slug: string) {
  return `spotlight-${slug}`;
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
  const containerRef = useRef<HTMLUListElement>(null);

  // List view: only one row's comments are expanded at a time so the
  // layout stays scannable. The currently-focused spotlight (via
  // `?spotlight=<slug>`) auto-expands so deep links land on a thread.
  const [expandedSlug, setExpandedSlug] = useState<string | null>(focusedSlug);
  useEffect(() => {
    if (focusedSlug) setExpandedSlug(focusedSlug);
  }, [focusedSlug]);

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
        {entries.map((entry) => {
          const canEdit = viewerCanEdit(entry, viewerId, viewerIsAdmin);
          const commentCount = entry.commentCount ?? 0;
          const isExpanded = expandedSlug === entry.slug;
          return (
            <li
              key={entry.id}
              id={entryAnchorId(entry.slug)}
              className="scroll-mt-6 transition-colors duration-300 data-[focused=true]:bg-[color:color-mix(in_srgb,var(--primary)_8%,var(--card))]"
            >
              <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 md:grid-cols-[72px_minmax(0,1fr)_auto_auto] md:gap-5 md:px-5">
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
                  <h3 className="truncate font-sans text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground md:text-[16px]">
                    <Link
                      href={`/?view=gallery&spotlight=${encodeURIComponent(entry.slug)}`}
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

                <div className="hidden items-center md:flex">
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

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSlug((current) =>
                        current === entry.slug ? null : entry.slug,
                      )
                    }
                    aria-expanded={isExpanded}
                    aria-controls={`comments-${entry.slug}`}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 border border-border bg-card px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isExpanded
                        ? "border-foreground/40 text-foreground"
                        : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    <MessageSquare className="h-3 w-3" aria-hidden strokeWidth={1.75} />
                    <span className="tabular-nums">{commentCount}</span>
                  </button>
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

              {isExpanded ? (
                <div id={`comments-${entry.slug}`}>
                  {canEdit ? (
                    <div className="border-t border-border bg-background/30 px-4 py-3 md:px-5">
                      <LeaderboardEntryEditor
                        slug={entry.slug}
                        storyTitle={entry.storyTitle}
                        storySummary={entry.storySummary}
                      />
                    </div>
                  ) : null}
                  <LeaderboardComments
                    slug={entry.slug}
                    initialCount={commentCount}
                    isSignedIn={isSignedIn}
                    viewerId={viewerId}
                    viewerIsAdmin={viewerIsAdmin}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul ref={containerRef} className="grid gap-5">
      {entries.map((entry) => {
        const canEdit = viewerCanEdit(entry, viewerId, viewerIsAdmin);
        return (
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
                    {entry.createdByDisplayName ? (
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        by{" "}
                        <span className="normal-case tracking-normal text-foreground">
                          {entry.createdByDisplayName}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-start gap-3">
                    {canEdit ? (
                      <LeaderboardEntryEditor
                        slug={entry.slug}
                        storyTitle={entry.storyTitle}
                        storySummary={entry.storySummary}
                      />
                    ) : null}
                    <div
                      aria-label={`Score: ${entry.score}`}
                      className="flex flex-col items-end leading-none"
                    >
                      <span className="font-sans text-[32px] font-semibold tabular-nums tracking-[-0.02em] text-foreground md:text-[40px]">
                        {entry.score}
                      </span>
                      <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        {entry.upvotes} up · {entry.downvotes} down
                      </span>
                    </div>
                  </div>
                </div>
                <h2 className="font-sans text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[26px]">
                  {entry.storyTitle}
                </h2>
                <p className="font-sans text-[14px] leading-[1.55] text-muted-foreground">
                  {entry.storySummary}
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
            <LeaderboardComments
              slug={entry.slug}
              initialCount={entry.commentCount ?? 0}
              isSignedIn={isSignedIn}
              viewerId={viewerId}
              viewerIsAdmin={viewerIsAdmin}
            />
          </li>
        );
      })}
    </ul>
  );
}
