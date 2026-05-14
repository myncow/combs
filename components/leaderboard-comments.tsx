"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addLeaderboardCommentAction,
  deleteLeaderboardCommentAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { buildAuthRedirectHref } from "@/lib/auth/redirect";
import type { LeaderboardComment } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Inline comments thread for a single leaderboard entry. Renders the
 * existing comments (newest first) and, for signed-in viewers, a
 * compact composer at the top.
 *
 * The list is fetched lazily on mount via `/api/leaderboard/[slug]/comments`,
 * so the initial render is just chrome — the leaderboard page itself only
 * needs the count to power the toggle.
 */
export function LeaderboardComments({
  slug,
  initialCount,
  isSignedIn,
  viewerId,
  viewerIsAdmin = false,
}: {
  slug: string;
  initialCount: number;
  isSignedIn: boolean;
  viewerId?: string | null;
  viewerIsAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [comments, setComments] = useState<LeaderboardComment[]>([]);
  const [count, setCount] = useState(initialCount);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const composerId = useId();
  const signInHref = buildAuthRedirectHref(
    "/auth/sign-in",
    pathname,
    searchParams?.toString() ?? "",
  );

  // Always lazy-load on mount so the thread feels alive without a
  // separate "Load comments" press.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard/${slug}/comments`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load failed"))))
      .then((payload: { items: LeaderboardComment[] }) => {
        if (cancelled) return;
        setComments(payload.items ?? []);
        setCount(payload.items?.length ?? 0);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load comments.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSignedIn) {
      router.push(signInHref);
      return;
    }
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("body", text);
      const result = await addLeaderboardCommentAction({ status: "idle" }, fd);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setBody("");
      // Optimistic refetch so we pick up the saved id + server-side
      // moderation in case the local body was rewritten.
      try {
        const res = await fetch(`/api/leaderboard/${slug}/comments`, { cache: "no-store" });
        if (res.ok) {
          const payload = (await res.json()) as { items: LeaderboardComment[] };
          setComments(payload.items ?? []);
          setCount(payload.items?.length ?? 0);
        }
      } catch {
        // Worst case the comment will appear on next page load.
      }
      textareaRef.current?.focus();
    });
  }

  async function handleDelete(commentId: string) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("commentId", commentId);
      const result = await deleteLeaderboardCommentAction({ status: "idle" }, fd);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setComments((current) => current.filter((c) => c.id !== commentId));
      setCount((n) => Math.max(0, n - 1));
    });
  }

  return (
    <div className="border-t border-border">
      <div className="flex items-center gap-2 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground md:px-5">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
        <span>
          {count} {count === 1 ? "comment" : "comments"}
        </span>
        {loading ? <Spinner size="sm" className="text-muted-foreground" /> : null}
      </div>

      <div className="grid gap-3 px-4 pb-4 md:px-5">
        <form
          onSubmit={handleSubmit}
          aria-describedby={error ? `${composerId}-error` : undefined}
          className="grid gap-2"
        >
          <label htmlFor={composerId} className="sr-only">
            Add a comment
          </label>
          <textarea
            ref={textareaRef}
            id={composerId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={isSignedIn ? "Add a comment…" : "Sign in to comment"}
            disabled={!isSignedIn || pending}
            rows={2}
            maxLength={1200}
            className={cn(
              "w-full resize-y border border-border bg-background px-3 py-2 font-sans text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !isSignedIn && "cursor-not-allowed opacity-60",
            )}
          />
          <div className="flex items-center justify-between gap-3">
            {error ? (
              <p
                id={`${composerId}-error`}
                role="alert"
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--destructive)]"
              >
                {error}
              </p>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {body.length ? `${body.length} / 1200` : "Be kind."}
              </span>
            )}
            {isSignedIn ? (
              <Button
                type="submit"
                size="sm"
                disabled={pending || !body.trim()}
              >
                {pending ? "Posting…" : "Post"}
              </Button>
            ) : (
              <Button asChild size="sm" variant="secondary">
                <Link href={signInHref}>Sign in</Link>
              </Button>
            )}
          </div>
        </form>

        {loaded && comments.length === 0 ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            No comments yet.
          </p>
        ) : null}

        {comments.length ? (
          <ul className="grid gap-2">
            {comments.map((comment) => {
              const canDelete =
                viewerIsAdmin || (viewerId && comment.authorId === viewerId);
              return (
                <li
                  key={comment.id}
                  className="border border-border bg-card/60 px-3 py-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-sans text-[12.5px] font-semibold leading-none text-foreground">
                      {comment.authorDisplayName ?? "Anon"}
                    </p>
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <time dateTime={comment.createdAt}>
                        {formatTimestamp(comment.createdAt)}
                      </time>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(comment.id)}
                          disabled={pending}
                          aria-label="Delete comment"
                          title="Delete"
                          className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-[color:var(--destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap font-sans text-[13px] leading-[1.55] text-foreground">
                    {comment.body}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
