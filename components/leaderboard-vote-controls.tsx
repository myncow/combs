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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={state.viewerVote === "up"}
          disabled={busy}
          onClick={() => void submitVote("up")}
          className={cn(
            "inline-flex items-center justify-center border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
            compact ? "h-8 w-8" : "h-10 w-10",
            state.viewerVote === "up"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
          title="Upvote"
          aria-label="Upvote spotlight"
        >
          <ArrowBigUp className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        </button>
        <div className="min-w-[4.5rem] border border-border bg-card px-3 py-2 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Score
          </div>
          <div className={cn("font-sans font-semibold text-foreground", compact ? "text-lg" : "text-2xl")}>
            {state.score}
          </div>
        </div>
        <button
          type="button"
          aria-pressed={state.viewerVote === "down"}
          disabled={busy}
          onClick={() => void submitVote("down")}
          className={cn(
            "inline-flex items-center justify-center border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
            compact ? "h-8 w-8" : "h-10 w-10",
            state.viewerVote === "down"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground",
          )}
          title="Downvote"
          aria-label="Downvote spotlight"
        >
          <ArrowBigDown className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        </button>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        {state.upvotes} up · {state.downvotes} down
      </p>
      {error ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{error}</p>
      ) : null}
    </div>
  );
}
