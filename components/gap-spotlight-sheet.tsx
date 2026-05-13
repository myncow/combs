"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Lock, Save, Send, X } from "lucide-react";
import { publishGapSpotlightAction, type PublishGapSpotlightActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dispatchLibraryRefresh } from "@/lib/client-events";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cn } from "@/lib/utils";

const LOCAL_DRAFT_PREFIX = "raster-gap-spotlight-draft";

function localDraftKey(mapSlug: string, cellId: string) {
  return `${LOCAL_DRAFT_PREFIX}:${mapSlug}:${cellId}`;
}

type DraftPayload = {
  storyTitle: string;
  storySummary: string;
  updatedAt: string;
};

export function GapSpotlightSheet({
  onClose,
  mapSlug,
  mapTitle,
  mapIsPublic,
  cellId,
  cellLabel,
  imageUrl,
  defaultTitle,
  defaultSummary,
}: {
  onClose: () => void;
  mapSlug: string;
  mapTitle: string;
  topicFamily: string;
  /** Current visibility of the source map. Drives the make-public toggle copy. */
  mapIsPublic: boolean;
  cellId: string;
  cellLabel: string;
  coordinatesSnapshot: Record<string, string>;
  imageUrl: string;
  defaultTitle: string;
  defaultSummary: string;
}) {
  const router = useRouter();
  const storageKey = useMemo(() => localDraftKey(mapSlug, cellId), [cellId, mapSlug]);
  const [storyTitle, setStoryTitle] = useState(() => {
    if (typeof window === "undefined") return defaultTitle;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Partial<DraftPayload>) : null;
      return typeof parsed?.storyTitle === "string" && parsed.storyTitle.trim() ? parsed.storyTitle : defaultTitle;
    } catch {
      return defaultTitle;
    }
  });
  const [storySummary, setStorySummary] = useState(() => {
    if (typeof window === "undefined") return defaultSummary;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Partial<DraftPayload>) : null;
      return typeof parsed?.storySummary === "string" && parsed.storySummary.trim()
        ? parsed.storySummary
        : defaultSummary;
    } catch {
      return defaultSummary;
    }
  });
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);
  // Default ON when the map is private (otherwise the spotlight's "View source
  // map" link 404s for everyone but the owner). Disabled when already public.
  const [makePublic, setMakePublic] = useState(!mapIsPublic);
  const [state, formAction, isPending] = useActionState<PublishGapSpotlightActionState, FormData>(
    publishGapSpotlightAction,
    { status: "idle" },
  );

  useEffect(() => {
    if (state.status !== "success" || typeof window === "undefined") return;
    window.localStorage.removeItem(storageKey);
    dispatchLibraryRefresh();
    onClose();
    router.push(`/leaderboard?spotlight=${state.slug}`);
  }, [onClose, router, state, storageKey]);

  function saveDraft() {
    if (typeof window === "undefined") return;
    const payload: DraftPayload = {
      storyTitle: storyTitle.trim() || defaultTitle,
      storySummary: storySummary.trim() || defaultSummary,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    setDraftFeedback("Draft saved.");
    window.setTimeout(() => setDraftFeedback(null), 1800);
  }

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[color:color-mix(in_srgb,var(--foreground)_58%,transparent)] p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg border border-border bg-background shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Leaderboard</p>
            <h3
              id={titleId}
              className="mt-1.5 font-sans text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground"
            >
              Submit your spotlight
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form action={formAction} className="space-y-5 p-5">
          <input type="hidden" name="mapSlug" value={mapSlug} />
          <input type="hidden" name="cellId" value={cellId} />
          <input type="hidden" name="makePublic" value={String(mapIsPublic ? false : makePublic)} />

          <div className="overflow-hidden border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={storyTitle || defaultTitle}
              referrerPolicy="no-referrer"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>

          <div className="space-y-2">
            <label
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
              htmlFor="storyTitle"
            >
              Title
            </label>
            <Input
              id="storyTitle"
              name="storyTitle"
              maxLength={120}
              value={storyTitle}
              onChange={(event) => setStoryTitle(event.target.value)}
              placeholder={defaultTitle}
            />
          </div>

          <div className="space-y-2">
            <label
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
              htmlFor="storySummary"
            >
              Caption
            </label>
            <Textarea
              id="storySummary"
              name="storySummary"
              maxLength={220}
              value={storySummary}
              onChange={(event) => setStorySummary(event.target.value)}
              placeholder={defaultSummary}
              className="min-h-28"
            />
          </div>

          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            From <span className="text-foreground">{mapTitle}</span> · {cellLabel}
          </p>

          <div className="flex items-start gap-3 border border-border bg-card px-3 py-2.5">
            <div className="mt-[2px] flex h-5 w-5 items-center justify-center text-muted-foreground">
              {mapIsPublic || makePublic ? (
                <Globe className="h-4 w-4" aria-hidden strokeWidth={2} />
              ) : (
                <Lock className="h-4 w-4" aria-hidden strokeWidth={2} />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {mapIsPublic ? (
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Source map is <span className="text-primary">public</span> — visitors can open it from this spotlight.
                </p>
              ) : (
                <label className="flex items-start gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-[3px] h-3.5 w-3.5 cursor-pointer accent-[color:var(--primary)]"
                    checked={makePublic}
                    onChange={(event) => setMakePublic(event.target.checked)}
                  />
                  <span>
                    Make source map public when publishing.{" "}
                    <span className={cn(makePublic ? "text-primary" : "text-foreground")}>
                      {makePublic
                        ? "Anyone visiting the spotlight can open the full map."
                        : "Spotlight will be visible, but the source-map link will 404 for other viewers."}
                    </span>
                  </span>
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" disabled={isPending}>
              <Send className={cn("h-3.5 w-3.5", isPending && "animate-pulse")} aria-hidden />
              {isPending ? "Publishing" : "Publish"}
            </Button>
            <Button type="button" variant="secondary" onClick={saveDraft}>
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save draft
            </Button>
            {draftFeedback ? (
              <p className="ml-auto font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
                {draftFeedback}
              </p>
            ) : null}
          </div>

          {state.status === "error" ? (
            <p
              role="alert"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive"
            >
              {state.message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
