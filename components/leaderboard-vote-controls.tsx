"use client";

import { startTransition, useState } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { dispatchLibraryRefresh } from "@/lib/client-events";
import { cn } from "@/lib/utils";
import type { LeaderboardVoteDirection } from "@/lib/types";

type VoteState = {
  score: number;
  upvotes: number;
  downvotes: number;
  viewerVote: LeaderboardVoteDirection | null;
};

function applyVote(
  state: VoteState,
  nextDirection: LeaderboardVoteDirection | null,
): VoteState {
  const upvotes =
    state.upvotes -
    (state.viewerVote === "up" ? 1 : 0) +
    (nextDirection === "up" ? 1 : 0);
  const downvotes =
    state.downvotes -
    (state.viewerVote === "down" ? 1 : 0) +
    (nextDirection === "down" ? 1 : 0);

  return {
    score: upvotes - downvotes,
    upvotes,
    downvotes,
    viewerVote: nextDirection,
  };
}

export function LeaderboardVoteControls({
  slug,
  score,
  upvotes,
  downvotes,
  viewerVote,
  compact = false,
}: {
  slug: string;
  score: number;
  upvotes: number;
  downvotes: number;
  viewerVote?: LeaderboardVoteDirection | null;
  compact?: boolean;
}) {
  const [state, setState] = useState<VoteState>({
    score,
    upvotes,
    downvotes,
    viewerVote: viewerVote ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitVote(direction: LeaderboardVoteDirection) {
    if (busy) return;

    const nextDirection = state.viewerVote === direction ? null : direction;
    const previous = state;
    setBusy(true);
    setError(null);
    startTransition(() => {
      setState(applyVote(previous, nextDirection));
    });

    try {
      const response = await fetch(`/api/leaderboard/${slug}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ direction: nextDirection }),
      });
      if (!response.ok) {
        throw new Error("Vote request failed.");
      }
      const data = (await response.json()) as VoteState;
      dispatchLibraryRefresh();
      startTransition(() => {
        setState({
          score: data.score,
          upvotes: data.upvotes,
          downvotes: data.downvotes,
          viewerVote: data.viewerVote,
        });
      });
    } catch {
      startTransition(() => {
        setState(previous);
      });
      setError("Could not save vote.");
    } finally {
      setBusy(false);
    }
  }

  const helperId = `vote-helper-${slug}`;
  const helperText =
    state.viewerVote === "up"
      ? "Your vote: up · click down to switch · click up to clear"
      : state.viewerVote === "down"
        ? "Your vote: down · click up to switch · click down to clear"
        : "One vote per spotlight — pick up or down";

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Vote on this spotlight"
        aria-describedby={helperId}
        className="inline-flex items-stretch border border-border bg-background"
      >
        <button
          type="button"
          role="radio"
          aria-checked={state.viewerVote === "up"}
          disabled={busy}
          onClick={() => void submitVote("up")}
          className={cn(
            "inline-flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
            compact ? "h-8 w-8" : "h-10 w-10",
            state.viewerVote === "up"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          title={state.viewerVote === "up" ? "Click again to clear your vote" : "Upvote"}
          aria-label="Upvote spotlight"
        >
          <ArrowBigUp className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        </button>
        <div className="min-w-[4.5rem] border-x border-border bg-card px-3 py-1 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Score
          </div>
          <div className={cn("font-sans font-semibold text-foreground", compact ? "text-lg" : "text-2xl")}>
            {state.score}
          </div>
        </div>
        <button
          type="button"
          role="radio"
          aria-checked={state.viewerVote === "down"}
          disabled={busy}
          onClick={() => void submitVote("down")}
          className={cn(
            "inline-flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
            compact ? "h-8 w-8" : "h-10 w-10",
            state.viewerVote === "down"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          title={state.viewerVote === "down" ? "Click again to clear your vote" : "Downvote"}
          aria-label="Downvote spotlight"
        >
          <ArrowBigDown className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        </button>
      </div>
      <p
        id={helperId}
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
      >
        {state.upvotes} up · {state.downvotes} down · <span className="normal-case tracking-normal">{helperText}</span>
      </p>
      {error ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
