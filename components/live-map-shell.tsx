"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MapRenderer } from "@/components/map-renderer";
import { dispatchLibraryRefresh } from "@/lib/client-events";
import type { GenerationTraceEvent } from "@/lib/generation-stream";
import { revealTransition } from "@/lib/motion";
import type { MapDocument, SavedMap } from "@/lib/types";
import { cn, simplifyMapDisplayTitle } from "@/lib/utils";

type LiveStatus = "generating" | "published" | "failed";

export function LiveMapShell({
  initial,
  slug,
  canMutateMap = false,
}: {
  initial: SavedMap;
  slug: string;
  canMutateMap?: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const [doc, setDoc] = useState<MapDocument>(initial.document);
  const initialLive: LiveStatus =
    initial.status === "published" || initial.status === "internal"
      ? "published"
      : initial.status === "failed"
        ? "failed"
        : "generating";
  const [status, setStatus] = useState<LiveStatus>(initialLive);
  // While the server keeps streaming snapshots after publish (SerpApi
  // enrichment), `enriching` stays true. It flips off on the explicit
  // `complete` event from the SSE endpoint.
  const [enriching, setEnriching] = useState<boolean>(initialLive === "generating");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initial.status === "failed" ? initial.summary || "Generation failed." : null,
  );
  const lastRevisionRef = useRef<number>(initial.revision ?? 0);

  useEffect(() => {
    if (status === "failed") return;
    if (!enriching && status === "published") return;
    const source = new EventSource(`/api/maps/${slug}/events`);

    source.addEventListener("message", (event) => {
      let parsed: GenerationTraceEvent | null = null;
      try {
        parsed = JSON.parse((event as MessageEvent<string>).data);
      } catch {
        return;
      }
      if (!parsed) return;
      if (parsed.type === "snapshot") {
        if (parsed.revision >= lastRevisionRef.current) {
          lastRevisionRef.current = parsed.revision;
          setDoc(parsed.document);
          if (parsed.status === "failed") {
            setStatus("failed");
          } else if (parsed.status === "published" && status !== "published") {
            // Publish moment — flip UI to "published" but keep SSE open
            // until the server emits `complete` (so SerpApi enrichment
            // patches keep streaming in).
            setStatus("published");
          }
        }
      } else if (parsed.type === "complete") {
        setStatus("published");
        setEnriching(false);
      } else if (parsed.type === "failed") {
        setStatus("failed");
        setEnriching(false);
        setErrorMessage(parsed.message || "Generation failed.");
      } else if (parsed.type === "error") {
        setStatus("failed");
        setEnriching(false);
        setErrorMessage(parsed.message || "Generation failed.");
      }
    });

    source.addEventListener("error", () => {
      // EventSource auto-retries; only flip to failed if the server explicitly says so.
    });

    return () => {
      source.close();
    };
  }, [slug, status, enriching]);

  // When status flips to published, ask the server component to re-render
  // so subsequent navigations see the static map (and we drop the live shell).
  useEffect(() => {
    if (status === "published") {
      dispatchLibraryRefresh();
      router.refresh();
    }
  }, [status, router]);

  const isLive = status === "generating";
  const isEnriching = status === "published" && enriching;
  const showIndicator = isLive || isEnriching;
  const displayedTitle = simplifyMapDisplayTitle(
    doc.title || initial.title,
    doc.topicFamily || initial.topicFamily,
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="shrink-0 py-3 lg:py-2">
        <h1
          key={displayedTitle}
          className={cn(
            "font-sans text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[36px] lg:text-[26px]",
            isLive && "live-text-crossfade",
          )}
        >
          {displayedTitle}
        </h1>
      </div>
      <AnimatePresence initial={false}>
        {showIndicator ? (
          <motion.div
            key="live-indicator"
            className="sticky top-0 z-20 shrink-0 overflow-hidden border-b border-border/60 bg-background/85 backdrop-blur"
            role="status"
            aria-live="polite"
            aria-label={isEnriching ? "Searching examples on Google Images" : "Sketching the grid"}
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
                {isEnriching ? "Searching examples" : "Sketching the grid"}
                <span className="ml-2 text-muted-foreground">
                  {isEnriching ? "· Google Images via SerpAPI" : "· building cells"}
                </span>
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
        <MapRenderer document={doc} live={isLive} canMutateMap={canMutateMap} />
      </div>
    </div>
  );
}
