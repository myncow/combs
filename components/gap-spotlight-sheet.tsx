"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Save, Send, X } from "lucide-react";
import { publishGapSpotlightAction, type PublishGapSpotlightActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { dispatchLibraryRefresh } from "@/lib/client-events";
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
  topicFamily,
  cellId,
  cellLabel,
  coordinatesSnapshot,
  imageUrl,
  defaultTitle,
  defaultSummary,
}: {
  onClose: () => void;
  mapSlug: string;
  mapTitle: string;
  topicFamily: string;
  cellId: string;
  cellLabel: string;
  coordinatesSnapshot: Record<string, string>;
  imageUrl: string;
  defaultTitle: string;
  defaultSummary: string;
}) {
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
  const [state, formAction, isPending] = useActionState<PublishGapSpotlightActionState, FormData>(
    publishGapSpotlightAction,
    { status: "idle" },
  );

  useEffect(() => {
    if (state.status !== "success" || typeof window === "undefined") return;
    window.localStorage.removeItem(storageKey);
    dispatchLibraryRefresh();
    onClose();
  }, [onClose, state.status, storageKey]);

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

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[color:color-mix(in_srgb,var(--foreground)_58%,transparent)] p-4">
      <div className="w-full max-w-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Publish to top list</p>
            <h3 className="mt-2 font-sans text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
              Share this frontier spotlight
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            aria-label="Close publish sheet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form action={formAction} className="grid gap-6 p-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <div className="overflow-hidden border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={storyTitle || defaultTitle}
                referrerPolicy="no-referrer"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">{topicFamily}</Badge>
              <Badge variant="muted">{mapTitle}</Badge>
            </div>
            <div className="space-y-2 border border-border bg-card p-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Source cell</p>
              <p className="text-[15px] font-medium text-foreground">{cellLabel}</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {Object.entries(coordinatesSnapshot)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <input type="hidden" name="mapSlug" value={mapSlug} />
            <input type="hidden" name="cellId" value={cellId} />
            <div className="space-y-2">
              <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground" htmlFor="storyTitle">
                Share title
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
              <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground" htmlFor="storySummary">
                Why this matters
              </label>
              <Textarea
                id="storySummary"
                name="storySummary"
                maxLength={220}
                value={storySummary}
                onChange={(event) => setStorySummary(event.target.value)}
                placeholder={defaultSummary}
                className="min-h-36"
              />
            </div>
            <p className="text-[15px] leading-6 text-muted-foreground">
              Keep this tight and legible. The leaderboard card will highlight the image first, then this one-line story.
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={saveDraft}>
                <Save className="h-3.5 w-3.5" aria-hidden />
                Save draft
              </Button>
              <Button type="submit" disabled={isPending}>
                <Send className={cn("h-3.5 w-3.5", isPending && "animate-pulse")} aria-hidden />
                {isPending ? "Publishing" : "Publish"}
              </Button>
            </div>

            {draftFeedback ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{draftFeedback}</p>
            ) : null}
            {state.status === "error" ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{state.message}</p>
            ) : null}
            {state.status === "success" ? (
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
                Published. View at /leaderboard/{state.slug}
              </p>
            ) : null}

            {state.status === "success" ? (
              <Button variant="link" asChild>
                <a href={`/leaderboard/${state.slug}`}>
                  Open published spotlight
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </Button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
