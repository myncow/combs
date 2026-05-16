"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
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
  bleed = true,
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
  /**
   * When true (default) the list view's table bleeds to the page's
   * `px-8` gutter. Pass false when the gallery is rendered inside a
   * column with a sibling sidebar so it doesn't overflow into it.
   */
  bleed?: boolean;
}) {
  const searchParams = useSearchParams();
  // Backward compat: existing share links still use `?spotlight=<slug>`.
  const focusedSlug = searchParams.get("spotlight");
  const listContainerRef = useRef<HTMLUListElement>(null);
  const galleryContainerRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!focusedSlug) return;
    const root = listContainerRef.current ?? galleryContainerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `#${CSS.escape(entryAnchorId(focusedSlug))}`,
    );
    if (!target) return;
    // Scroll only the nearest scrollable ancestor (the list scroll region)
    // rather than calling Element.scrollIntoView, which also walks up to the
    // document and pulls the sticky site header offscreen when block:"start".
    const scroller = findScrollableAncestor(target);
    if (scroller) {
      const targetTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: Math.max(0, targetTop - 8), behavior: "smooth" });
    }
    target.dataset.focused = "true";
    const timer = window.setTimeout(() => {
      delete target.dataset.focused;
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [focusedSlug]);

  if (!entries.length) return null;

  if (view === "list") {
    return (
      <div
        className={cn(
          "-mx-5 border-y border-border bg-card",
          bleed ? "md:-mx-8" : "md:mx-0",
        )}
      >
        {/* Mobile: stacked rows. A <table> wrapped in `overflow-x-auto` lets
            phone-width content scroll sideways — the most common cause of the
            "rows overflow horizontally" complaint. A single flex row per item
            can never exceed its container, so we use that on <md. */}
        <ul ref={listContainerRef} className="md:hidden">
          {entries.map((entry) => {
            const expandHref = `/?view=gallery&spotlight=${encodeURIComponent(entry.slug)}`;
            return (
              <li
                key={entry.id}
                id={entryAnchorId(entry.slug)}
                className="scroll-mt-6 border-b border-border last:border-b-0"
              >
                <Link
                  href={expandHref}
                  aria-label={`Expand ${entry.storyTitle}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className="relative aspect-square h-12 w-12 shrink-0 overflow-hidden border border-border bg-muted">
                    <Image
                      src={entry.imageUrl}
                      alt=""
                      fill
                      sizes="48px"
                      referrerPolicy="no-referrer"
                      className="object-cover"
                    />
                  </div>
                  <h3 className="min-w-0 flex-1 truncate font-sans text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
                    {entry.storyTitle}
                  </h3>
                  <span
                    aria-label={`Score ${entry.score}`}
                    className="shrink-0 border border-border bg-background px-2 py-0.5 font-mono text-[12px] tabular-nums text-foreground"
                  >
                    {entry.score > 0 ? `+${entry.score}` : entry.score}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[72px]">Entry</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-[180px]">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const expandHref = `/?view=gallery&spotlight=${encodeURIComponent(entry.slug)}`;
                const ownVoteBlocked = Boolean(
                  viewerId && entry.mapOwnerId && viewerId === entry.mapOwnerId,
                );
                return (
                  <TableRow
                    key={entry.id}
                    id={`${entryAnchorId(entry.slug)}-md`}
                    className="relative scroll-mt-6 transition-colors hover:bg-muted/30"
                  >
                    <TableCell>
                      <Link
                        href={expandHref}
                        aria-label={`Expand ${entry.storyTitle}`}
                        className="relative z-10 block aspect-square h-14 w-14 overflow-hidden border border-border bg-muted"
                      >
                        <Image
                          src={entry.imageUrl}
                          alt=""
                          fill
                          sizes="56px"
                          referrerPolicy="no-referrer"
                          className="object-cover"
                        />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <h3 className="relative truncate font-sans text-[16px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
                          <Link
                            href={expandHref}
                            className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-primary"
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
                    <TableCell className="relative z-10">
                      <LeaderboardVoteControls
                        slug={entry.slug}
                        score={entry.score}
                        upvotes={entry.upvotes}
                        downvotes={entry.downvotes}
                        viewerVote={entry.viewerVote ?? null}
                        compact
                        isSignedIn={isSignedIn}
                        disabledReason={
                          ownVoteBlocked ? "You can't vote on your own creation" : null
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <ul ref={galleryContainerRef} className="grid gap-5">
      {entries.map((entry) => {
        const canEdit = viewerCanEdit(entry, viewerId, viewerIsAdmin);
        const sourceHref = `/maps/${entry.mapSlug}#map-cell-${entry.cellId}`;
        const ownVoteBlocked = Boolean(
          viewerId && entry.mapOwnerId && viewerId === entry.mapOwnerId,
        );
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
                <Image
                  src={entry.imageUrl}
                  alt={entry.storyTitle}
                  width={1200}
                  height={900}
                  sizes="(max-width: 768px) 100vw, 60vw"
                  referrerPolicy="no-referrer"
                  className="block h-auto max-h-[50vh] w-full object-contain md:max-h-[78vh]"
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
                  {/* On mobile we keep only the source-map link; topic + author are
                      visible on md+ where the metadata line doesn't crowd the summary. */}
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span className="hidden md:inline">{entry.topicFamily}</span>
                    {entry.createdByDisplayName ? (
                      <>
                        <span aria-hidden className="hidden text-muted-foreground/50 md:inline">·</span>
                        <span className="hidden normal-case tracking-normal md:inline">
                          by {entry.createdByDisplayName}
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden className="hidden text-muted-foreground/50 md:inline">·</span>
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
                    disabledReason={
                      ownVoteBlocked ? "You can't vote on your own creation" : null
                    }
                  />
                </div>
                {/* Comments section is capped on both viewports — on mobile we cap
                    tighter so a long thread doesn't dominate the spotlight. */}
                <section
                  id={commentsAnchorId(entry.slug)}
                  aria-label={`Comments on ${entry.storyTitle}`}
                  className="max-h-[32vh] scroll-mt-6 overflow-y-auto border-t border-border md:max-h-[44vh]"
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
