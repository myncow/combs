"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapCard } from "@/components/map-card";
import { LIBRARY_REFRESH_EVENT } from "@/lib/client-events";
import { entryTransition } from "@/lib/motion";
import type { ListedLeaderboardEntry, SavedMap } from "@/lib/types";
import { cn } from "@/lib/utils";

type MapsPayload = { items?: SavedMap[]; total?: number };
type LeaderboardPayload = { items?: ListedLeaderboardEntry[] };

export type ExplorerSidebarProps = {
  isSignedIn: boolean;
  initialMaps?: { items: SavedMap[]; total: number };
  initialLeaderboard?: ListedLeaderboardEntry[];
  /** Set when server-side library load threw — shown until client refresh succeeds. */
  initialHydrationError?: string;
};

export function ExplorerSidebar({
  isSignedIn,
  initialMaps,
  initialLeaderboard,
  initialHydrationError,
}: ExplorerSidebarProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const topicFamily = searchParams.get("topicFamily") ?? undefined;
  const reduceMotion = useReducedMotion() ?? false;

  const [tab, setTab] = useState<"maps" | "leaderboard">(() => (isSignedIn ? "maps" : "leaderboard"));
  const prevSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (prevSignedInRef.current === false && isSignedIn) {
      setTab("maps");
    }
    prevSignedInRef.current = isSignedIn;
  }, [isSignedIn]);
  const [collapsed, setCollapsed] = useState(false);
  const [maps, setMaps] = useState<SavedMap[]>(() => initialMaps?.items ?? []);
  const [mapsTotal, setMapsTotal] = useState(() => initialMaps?.total ?? 0);
  const [leaderboard, setLeaderboard] = useState<ListedLeaderboardEntry[]>(() => initialLeaderboard ?? []);
  const [loadErr, setLoadErr] = useState<string | null>(() => initialHydrationError ?? null);

  const loadMaps = useCallback(async () => {
    const qs = new URLSearchParams({ pageSize: "48", sort: "recent", status: "live", page: "1" });
    if (topicFamily) qs.set("topicFamily", topicFamily);
    const res = await fetch(`/api/maps?${qs}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Maps request failed");
    }
    const data = (await res.json()) as MapsPayload;
    setMaps(Array.isArray(data.items) ? data.items : []);
    setMapsTotal(typeof data.total === "number" ? data.total : 0);
  }, [topicFamily]);

  const loadLeaderboard = useCallback(async () => {
    const res = await fetch("/api/leaderboard?sort=top&pageSize=24", { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Leaderboard request failed");
    }
    const data = (await res.json()) as LeaderboardPayload;
    setLeaderboard(Array.isArray(data.items) ? data.items : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) {
        setLoadErr(initialHydrationError ?? null);
      }
      try {
        await Promise.all([loadMaps(), loadLeaderboard()]);
        if (!cancelled) {
          setLoadErr(null);
        }
      } catch {
        if (!cancelled) {
          setLoadErr("Could not load library.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicFamily, loadLeaderboard, loadMaps, initialHydrationError]);

  // While any map is still generating, refresh the list every few seconds so
  // the sidebar reflects the live status. Polling stops as soon as no maps
  // are in the "generating" state.
  const hasGenerating = maps.some((m) => m.status === "generating");
  useEffect(() => {
    if (!hasGenerating) return;
    const handle = window.setInterval(() => {
      void loadMaps().catch(() => {
        /* swallow — next tick retries */
      });
    }, 4000);
    return () => window.clearInterval(handle);
  }, [hasGenerating, loadMaps]);

  useEffect(() => {
    const refreshLibrary = () => {
      void Promise.all([loadMaps(), loadLeaderboard()]).catch(() => {
        /* The regular hydration effect and polling will retry. */
      });
    };
    window.addEventListener(LIBRARY_REFRESH_EVENT, refreshLibrary);
    return () => {
      window.removeEventListener(LIBRARY_REFRESH_EVENT, refreshLibrary);
    };
  }, [loadLeaderboard, loadMaps]);

  const handleMapDeleted = useCallback(
    (deletedSlug: string) => {
      setMaps((current) => current.filter((map) => map.slug !== deletedSlug));
      setMapsTotal((current) => Math.max(0, current - 1));
      void loadMaps().catch(() => {
        /* Optimistic removal already happened; the regular effect will retry. */
      });
    },
    [loadMaps],
  );

  useEffect(() => {
    const handleDetailToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (detail?.open) {
        setCollapsed(true);
      }
    };

    window.addEventListener("raster:cell-detail-toggle", handleDetailToggle as EventListener);
    return () => {
      window.removeEventListener("raster:cell-detail-toggle", handleDetailToggle as EventListener);
    };
  }, []);

  const activeTab =
    pathname.startsWith("/leaderboard") ? "leaderboard" : pathname === "/gallery" ? "maps" : tab;

  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 shrink-0 flex-col border-t border-border bg-background transition-[max-width,width] duration-200 md:border-r md:border-t-0",
        collapsed
          ? "w-full md:max-h-none md:w-14 md:max-w-14"
          : "max-h-[44vh] w-full md:max-h-none md:w-[min(360px,34vw)] md:max-w-[min(360px,34vw)]",
      )}
      aria-label="Library and suggested axes"
    >
      {/* Primary path: new map. Signed-out users land on the create form and are
          redirected to sign-in only when they submit. */}
      <div className="shrink-0 border-b border-border px-2 py-2">
        <Link
          href="/"
          aria-label="New map"
          className={cn(
            "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-sm border border-border bg-card px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground transition-[border-color,background-color,color] duration-150 hover:border-primary/35 hover:bg-[color:color-mix(in_srgb,var(--primary)_6%,var(--card))] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            collapsed && "md:px-0",
          )}
        >
          <Plus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden strokeWidth={2.5} />
          <span className={cn(collapsed && "md:hidden")}>New map</span>
        </Link>
      </div>

      {/* Panel toggle row */}
      <div className="shrink-0 border-b border-border px-2 py-2">
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-0"
            aria-label="Show library sidebar"
            title="Show library"
          >
            <ChevronsRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="md:hidden">Show gallery</span>
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab("maps")}
              aria-pressed={activeTab === "maps"}
              className={
                "rounded-sm px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors " +
                (activeTab === "maps"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              Maps
            </button>
            <button
              type="button"
              onClick={() => setTab("leaderboard")}
              aria-pressed={activeTab === "leaderboard"}
              className={
                "rounded-sm px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors " +
                (activeTab === "leaderboard"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              Top list
            </button>
            <span className="ml-auto truncate font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
              {activeTab === "maps"
                ? mapsTotal === 1
                  ? "1 map"
                  : `${mapsTotal} maps`
                : leaderboard.length === 1
                  ? "1 spotlight"
                  : `${leaderboard.length} spotlights`}
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-border bg-background px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Hide library sidebar"
              title="Hide gallery"
            >
              <span>Hide</span>
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {!collapsed ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loadErr ? (
            <p className="px-3 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              {loadErr}
            </p>
          ) : activeTab === "maps" ? (
            maps.length ? (
              <ul className="divide-y divide-border border-b border-border">
                <AnimatePresence initial={false}>
                  {maps.map((map) => (
                    <motion.li
                      key={map.id}
                      layout={!reduceMotion}
                      initial={
                        reduceMotion
                          ? { opacity: 1, height: "auto" }
                          : { opacity: 0, height: 0 }
                      }
                      animate={{ opacity: 1, height: "auto" }}
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, height: 0 }
                      }
                      transition={entryTransition(reduceMotion)}
                      style={{ overflow: "hidden" }}
                    >
                      <MapCard map={map} allowDelete compact onDeleted={handleMapDeleted} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                No maps yet.
              </p>
            )
          ) : leaderboard.length ? (
            <ul className="divide-y divide-border border-b border-border">
              {leaderboard.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/leaderboard/${entry.slug}`}
                    className="flex items-start gap-3 px-2 py-2.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    aria-label={`Open spotlight ${entry.storyTitle}`}
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden border border-border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="truncate text-[14px] font-semibold leading-tight text-foreground">
                        {entry.storyTitle}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {entry.mapTitle} · score {entry.score}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              No spotlights yet.
            </p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
