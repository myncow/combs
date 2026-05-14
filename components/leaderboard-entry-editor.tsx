"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { updateSpotlightAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cn } from "@/lib/utils";

type EditorMode = "view" | "editing";

/**
 * Inline editor for a leaderboard entry's headline + summary. Visible
 * only when the viewer is the source map's owner (or an admin). On
 * save we hit `updateSpotlightAction` and call `router.refresh` so the
 * leaderboard re-fetches with the new text.
 */
export function LeaderboardEntryEditor({
  slug,
  storyTitle,
  storySummary,
  titleClassName,
  summaryClassName,
}: {
  slug: string;
  storyTitle: string;
  storySummary: string;
  titleClassName?: string;
  summaryClassName?: string;
}) {
  const [mode, setMode] = useState<EditorMode>("view");
  const [title, setTitle] = useState(storyTitle);
  const [summary, setSummary] = useState(storySummary);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const summaryId = useId();

  useFocusTrap(dialogRef, mode === "editing");

  useEffect(() => {
    if (mode === "editing") {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "editing") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMode("view");
        setError(null);
        setTitle(storyTitle);
        setSummary(storySummary);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, storyTitle, storySummary]);

  function handleSave() {
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedSummary = summary.trim();
    if (!trimmedTitle || !trimmedSummary) {
      setError("Title and summary are required.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("storyTitle", trimmedTitle);
      fd.set("storySummary", trimmedSummary);
      const result = await updateSpotlightAction({ status: "idle" }, fd);
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setMode("view");
      // Hard reload keeps the parent server component (leaderboard
      // list / spotlight detail) in sync without router.refresh races.
      window.location.reload();
    });
  }

  if (mode === "view") {
    return (
      <button
        type="button"
        onClick={() => setMode("editing")}
        aria-label="Edit entry"
        title="Edit"
        className="inline-flex h-7 items-center gap-1.5 border border-border bg-card px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil className="h-3 w-3" aria-hidden strokeWidth={1.75} />
        <span>Edit</span>
      </button>
    );
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Edit leaderboard entry"
      className="grid gap-2 border border-foreground/30 bg-card px-3 py-3"
    >
      <label htmlFor={titleId} className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Title
      </label>
      <input
        ref={titleInputRef}
        id={titleId}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        disabled={pending}
        className={cn(
          "w-full border border-border bg-background px-2.5 py-1.5 font-sans text-[14px] font-semibold leading-snug text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          titleClassName,
        )}
      />
      <label htmlFor={summaryId} className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Summary
      </label>
      <textarea
        id={summaryId}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        maxLength={220}
        rows={3}
        disabled={pending}
        className={cn(
          "w-full resize-y border border-border bg-background px-2.5 py-1.5 font-sans text-[13px] leading-snug text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          summaryClassName,
        )}
      />
      <div className="flex items-center justify-between gap-3">
        {error ? (
          <p role="alert" className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--destructive)]">
            {error}
          </p>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            {summary.length} / 220
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setMode("view");
              setError(null);
              setTitle(storyTitle);
              setSummary(storySummary);
            }}
            disabled={pending}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
