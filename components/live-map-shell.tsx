"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MapRenderer } from "@/components/map-renderer";
import { Spinner } from "@/components/ui/spinner";
import { dispatchLibraryRefresh } from "@/lib/client-events";
import type { GenerationTraceEvent } from "@/lib/generation-stream";
import {
  MOTION_DURATION,
  MOTION_EASE,
  entryTransition,
  revealTransition,
} from "@/lib/motion";
import type { MapDocument, SavedMap } from "@/lib/types";
import { cn, simplifyMapDisplayTitle } from "@/lib/utils";

type LiveStatus = "generating" | "published" | "failed";

type PhaseId = "frame" | "sketch" | "crossings" | "references";

type ProgressSnapshot = {
  percent: number;
  phase: PhaseId;
  cellsDone: number;
  cellsTotal: number;
  examplesWithImages: number;
  totalExamples: number;
};

function computeProgress(doc: MapDocument): ProgressSnapshot {
  const x = doc.dimensions?.[0];
  const y = doc.dimensions?.[1];
  const cellsTotal = (x?.values?.length ?? 0) * (y?.values?.length ?? 0);
  const cellsDone = doc.cells?.length ?? 0;
  const allExamples = doc.cells?.flatMap((c) => c.examples ?? []) ?? [];
  const totalExamples = allExamples.length;
  const examplesWithImages = allExamples.filter(
    (ex) => (ex.referenceImages?.length ?? 0) > 0,
  ).length;

  if (!x || !y || cellsTotal === 0) {
    if (!doc.dimensions?.length) {
      return {
        percent: 6,
        phase: "frame",
        cellsDone,
        cellsTotal,
        examplesWithImages,
        totalExamples,
      };
    }
    return {
      percent: 14,
      phase: "sketch",
      cellsDone,
      cellsTotal,
      examplesWithImages,
      totalExamples,
    };
  }

  if (cellsDone === 0) {
    return {
      percent: 18,
      phase: "sketch",
      cellsDone,
      cellsTotal,
      examplesWithImages,
      totalExamples,
    };
  }

  if (cellsDone < cellsTotal) {
    const frac = cellsDone / cellsTotal;
    return {
      percent: Math.min(75, 20 + frac * 55),
      phase: "crossings",
      cellsDone,
      cellsTotal,
      examplesWithImages,
      totalExamples,
    };
  }

  // All cells in. Now reference images stream in.
  if (totalExamples === 0) {
    return {
      percent: 92,
      phase: "references",
      cellsDone,
      cellsTotal,
      examplesWithImages,
      totalExamples,
    };
  }
  const refFrac = examplesWithImages / totalExamples;
  return {
    percent: Math.min(98, 78 + refFrac * 20),
    phase: "references",
    cellsDone,
    cellsTotal,
    examplesWithImages,
    totalExamples,
  };
}

function phaseLabel(progress: ProgressSnapshot): string {
  switch (progress.phase) {
    case "frame":
      return "Framing the topic…";
    case "sketch":
      return "Sketching the grid…";
    case "crossings":
      return progress.cellsTotal > 0
        ? `Trying crossings — ${progress.cellsDone} of ${progress.cellsTotal}`
        : "Trying crossings…";
    case "references":
      return progress.totalExamples > 0
        ? `Gathering references — ${progress.examplesWithImages} of ${progress.totalExamples}`
        : "Settling the map…";
  }
}

export function LiveMapShell({ initial, slug }: { initial: SavedMap; slug: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const [doc, setDoc] = useState<MapDocument>(initial.document);
  const [status, setStatus] = useState<LiveStatus>(
    initial.status === "published" || initial.status === "internal"
      ? "published"
      : initial.status === "failed"
        ? "failed"
        : "generating",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initial.status === "failed" ? initial.summary || "Generation failed." : null,
  );
  const lastRevisionRef = useRef<number>(initial.revision ?? 0);

  useEffect(() => {
    if (status !== "generating") return;
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
          if (parsed.status === "failed" || parsed.status === "published") {
            setStatus(parsed.status);
          }
        }
      } else if (parsed.type === "complete") {
        setStatus("published");
      } else if (parsed.type === "failed") {
        setStatus("failed");
        setErrorMessage(parsed.message || "Generation failed.");
      } else if (parsed.type === "error") {
        setStatus("failed");
        setErrorMessage(parsed.message || "Generation failed.");
      }
    });

    source.addEventListener("error", () => {
      // EventSource auto-retries; only flip to failed if the server explicitly says so.
    });

    return () => {
      source.close();
    };
  }, [slug, status]);

  // When status flips to published, ask the server component to re-render
  // so subsequent navigations see the static map (and we drop the live shell).
  useEffect(() => {
    if (status === "published") {
      dispatchLibraryRefresh();
      router.refresh();
    }
  }, [status, router]);

  const progress = useMemo(() => computeProgress(doc), [doc]);
  const isLive = status === "generating";
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
        {isLive ? (
          <motion.div
            key="live-banner"
            className="sticky top-0 z-20 shrink-0 overflow-hidden border-b border-border bg-background/95 backdrop-blur"
            aria-live="polite"
            initial={reduceMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={revealTransition(reduceMotion)}
          >
            <div className="flex items-center gap-2.5 px-4 py-2 md:px-5">
              <Spinner size="sm" className="text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={progress.phase}
                    className="truncate text-[13px] leading-snug text-foreground"
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                    transition={entryTransition(reduceMotion)}
                  >
                    {phaseLabel(progress)}
                  </motion.p>
                </AnimatePresence>
              </div>
              <span className="font-mono text-[10px] tabular-nums tracking-[0.18em] text-muted-foreground">
                {Math.round(progress.percent)}%
              </span>
            </div>
            <div className="h-px bg-border/70">
              <motion.div
                className="h-full bg-foreground/80"
                initial={false}
                animate={{ width: `${progress.percent}%` }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: MOTION_DURATION.long, ease: MOTION_EASE.out }
                }
              />
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
        <MapRenderer document={doc} live={isLive} />
      </div>
    </div>
  );
}
