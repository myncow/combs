"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ENRICHMENT_WINDOW_MS } from "@/components/map-card";
import { MapPosterExport } from "@/components/map-poster-export";
import { MapRenderer } from "@/components/map-renderer";
import { MapVisibilityControl } from "@/components/map-visibility-control";
import type { GenerationTraceEvent } from "@/lib/generation-stream";
import { revealTransition } from "@/lib/motion";
import type { MapDocument, SavedMap } from "@/lib/types";
import { cn, simplifyMapDisplayTitle } from "@/lib/utils";

type LiveStatus = "generating" | "published" | "failed";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export function LiveMapShell({
  initial,
  slug,
  canMutateMap = false,
  viewerLabel,
}: {
  initial: SavedMap;
  slug: string;
  canMutateMap?: boolean;
  viewerLabel?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [doc, setDoc] = useState<MapDocument>(initial.document);
  const initialLive: LiveStatus =
    initial.status === "published"
      ? "published"
      : initial.status === "failed"
        ? "failed"
        : "generating";
  const [status, setStatus] = useState<LiveStatus>(initialLive);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initial.status === "failed" ? initial.summary || "Generation failed." : null,
  );
  const lastRevisionRef = useRef<number>(initial.revision ?? 0);

  // Track the timestamp (ms) at which the map first reached `published`,
  // either as carried in from the server snapshot or observed live in
  // this client. The renderer keeps its cell-level "Searching examples…"
  // placeholders alive until ENRICHMENT_WINDOW_MS has elapsed past this,
  // mirroring the sidebar's enrichment indicator and avoiding the
  // jarring "loading stopped but the sidebar says we're still searching"
  // gap the user reported.
  const [publishedAtMs, setPublishedAtMs] = useState<number | null>(() =>
    initial.publishedAt ? new Date(initial.publishedAt).getTime() : null,
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (initialLive === "failed") return;

    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = RECONNECT_BASE_MS;

    const handle = (event: MessageEvent<string>) => {
      let parsed: GenerationTraceEvent | null = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!parsed) return;

      switch (parsed.type) {
        case "snapshot": {
          if (parsed.revision >= lastRevisionRef.current) {
            lastRevisionRef.current = parsed.revision;
            setDoc(parsed.document);
            if (parsed.status === "failed") setStatus("failed");
            else if (parsed.status === "published") {
              setStatus("published");
              setPublishedAtMs((prev) => prev ?? Date.now());
            } else setStatus("generating");
          }
          return;
        }
        case "cell_visualization": {
          if (parsed.revision >= lastRevisionRef.current) {
            lastRevisionRef.current = parsed.revision;
          }
          setDoc((prev) => mergeCellVisualization(prev, parsed.cellId, parsed.visualization));
          return;
        }
        case "status_change": {
          if (parsed.revision >= lastRevisionRef.current) {
            lastRevisionRef.current = parsed.revision;
          }
          if (parsed.status === "failed") setStatus("failed");
          else if (parsed.status === "published") {
            setStatus("published");
            setPublishedAtMs((prev) => prev ?? Date.now());
          } else setStatus("generating");
          return;
        }
        case "complete": {
          // Informational only; the connection stays open and we keep
          // listening for late patches (cell visualizations, axis tweaks).
          setStatus("published");
          setPublishedAtMs((prev) => prev ?? Date.now());
          return;
        }
        case "failed": {
          setStatus("failed");
          setErrorMessage(parsed.message || "Generation failed.");
          return;
        }
        case "error": {
          setErrorMessage(parsed.message || "Generation failed.");
          return;
        }
      }
    };

    const connect = () => {
      if (closed) return;
      if (typeof EventSource === "undefined") return;
      source = new EventSource(`/api/maps/${slug}/events`);
      source.addEventListener("message", handle as EventListener);
      source.addEventListener("open", () => {
        reconnectDelay = RECONNECT_BASE_MS;
      });
      source.addEventListener("error", () => {
        if (closed) return;
        // EventSource auto-retries on network errors, but in some
        // environments (e.g. dev server restarts) the connection can land
        // in a permanent CLOSED state. Tear it down and reconnect with
        // capped exponential backoff.
        if (source && source.readyState === EventSource.CLOSED) {
          source.close();
          source = null;
          reconnectTimer = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        }
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (source) source.close();
    };
  }, [slug, initialLive]);

  const enrichmentDeadlineMs = publishedAtMs ? publishedAtMs + ENRICHMENT_WINDOW_MS : null;
  const withinEnrichmentWindow =
    status === "published" &&
    enrichmentDeadlineMs !== null &&
    nowMs < enrichmentDeadlineMs;

  // Tick a re-render every few seconds while we're inside the enrichment
  // window so we naturally drop the cell-level placeholder at the
  // deadline without leaving it on forever if the SerpAPI passes never
  // land. We don't tick during pure generating — the SSE stream already
  // re-renders us on every patch.
  useEffect(() => {
    if (!withinEnrichmentWindow || !enrichmentDeadlineMs) return;
    const tickId = setInterval(() => setNowMs(Date.now()), 5_000);
    const stopId = setTimeout(
      () => setNowMs(Date.now()),
      Math.max(0, enrichmentDeadlineMs - Date.now()) + 100,
    );
    return () => {
      clearInterval(tickId);
      clearTimeout(stopId);
    };
  }, [withinEnrichmentWindow, enrichmentDeadlineMs]);

  // The top "Sketching the grid" banner only fires while the server is
  // still building the document. The cell-level loading state stays on
  // through both phases (generating + enrichment) so it matches the
  // sidebar's "Searching examples…" indicator.
  const isLive = status === "generating";
  const isLiveForCells = useMemo(
    () => isLive || withinEnrichmentWindow,
    [isLive, withinEnrichmentWindow],
  );
  const showIndicator = isLive;
  const displayedTitle = simplifyMapDisplayTitle(
    doc.title || initial.title,
    doc.topicFamily || initial.topicFamily,
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 py-3 lg:py-2">
        <h1
          key={displayedTitle}
          className={cn(
            "font-sans text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[36px] lg:text-[26px]",
            isLive && "live-text-crossfade",
          )}
        >
          {displayedTitle}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Export button is visible to any viewer who can read the
              map — non-owners can still copy/download an existing
              poster. Generation itself is gated on `canMutate` inside
              the dialog. */}
          <MapPosterExport
            slug={slug}
            canMutate={canMutateMap}
            initialPosterUrl={initial.posterUrl ?? null}
            initialPosterGeneratedAt={initial.posterGeneratedAt ?? null}
          />
          {canMutateMap ? (
            <MapVisibilityControl
              slug={slug}
              initialIsPublic={Boolean(initial.isPublic)}
              canMutate={canMutateMap}
              viewerLabel={viewerLabel}
            />
          ) : null}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showIndicator ? (
          <motion.div
            key="live-indicator"
            className="sticky top-0 z-20 shrink-0 overflow-hidden border-b border-border/60 bg-background/85 backdrop-blur"
            role="status"
            aria-live="polite"
            aria-label="Sketching the grid"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={revealTransition(reduceMotion)}
          >
            <div className="flex items-center gap-2.5 px-1 py-1.5">
              <span aria-hidden className="relative inline-flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
                <span className="absolute inset-0 rounded-full bg-primary" />
              </span>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/80">
                Sketching the grid
                <span className="ml-2 text-muted-foreground">· building cells</span>
              </p>
            </div>
            <div className="viz-loading-track h-[2px] rounded-none opacity-95">
              <div className="viz-loading-bar h-full" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {status === "failed" ? (
          <motion.div
            key="failed-banner"
            className={cn(
              "shrink-0 overflow-hidden border-b border-[color:var(--destructive)] bg-[color:color-mix(in_srgb,var(--destructive)_8%,var(--background))]",
            )}
            role="alert"
            initial={reduceMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={revealTransition(reduceMotion)}
          >
            <div className="px-4 py-3 md:px-5">
              <p className="text-[13px] font-medium leading-snug text-[color:var(--destructive)]">
                {errorMessage ?? "Generation failed."}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                Try a narrower topic, add more dimensions, or include canonical examples.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex-1 min-h-0 flex flex-col pb-3 md:pb-2">
        <MapRenderer
          document={doc}
          live={isLiveForCells}
          canMutateMap={canMutateMap}
          mapIsPublic={Boolean(initial.isPublic)}
        />
      </div>
    </div>
  );
}

function mergeCellVisualization(
  document: MapDocument,
  cellId: string,
  visualization: MapDocument["cells"][number]["visualization"],
): MapDocument {
  let changed = false;
  const cells = document.cells.map((cell) => {
    if (cell.id !== cellId) return cell;
    changed = true;
    return { ...cell, visualization };
  });
  if (!changed) return document;
  return { ...document, cells };
}
