"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapCard } from "@/components/map-card";
import { LIBRARY_REFRESH_EVENT } from "@/lib/client-events";
import { entryTransition } from "@/lib/motion";
import type { MapVisibility, SavedMap } from "@/lib/types";
import { cn } from "@/lib/utils";

type MapsPayload = { items?: SavedMap[]; total?: number };

type MapsListFrame =
  | {
      type: "map_status";
      slug: string;
      status: MapVisibility;
      updatedAt: string;
      isPublic: boolean;
      ownerId: string | null;
    }
  | { type: "map_deleted"; slug: string };

export type ExplorerSidebarProps = {
  isSignedIn: boolean;
  initialMaps?: { items: SavedMap[]; total: number };
  /** Set when server-side library load threw — shown until client refresh succeeds. */
  initialHydrationError?: string;
};

/**
 * Personal library rail. Lists ONLY the signed-in viewer's own maps; cross-app
 * navigation (New map, Leaderboard, Admin) lives in the header / settings menu
 * so this surface stays focused on the user's own work.
 */
export function ExplorerSidebar({
  isSignedIn,
  initialMaps,
  initialHydrationError,
}: ExplorerSidebarProps) {
  const searchParams = useSearchParams();
  const topicFamily = searchParams.get("topicFamily") ?? undefined;
  const reduceMotion = useReducedMotion() ?? false;

  const [collapsed, setCollapsed] = useState(false);
  const [maps, setMaps] = useState<SavedMap[]>(() => initialMaps?.items ?? []);
  const [loadErr, setLoadErr] = useState<string | null>(() => initialHydrationError ?? null);

  const loadMaps = useCallback(async () => {
    if (!isSignedIn) return;
    const qs = new URLSearchParams({
      pageSize: "48",
      sort: "recent",
      status: "library",
      page: "1",
      scope: "mine",
    });
    if (topicFamily) qs.set("topicFamily", topicFamily);
    const res = await fetch(`/api/maps?${qs}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Maps request failed");
    }
    const data = (await res.json()) as MapsPayload;
    setMaps(Array.isArray(data.items) ? data.items : []);
  }, [isSignedIn, topicFamily]);

  useEffect(() => {
    if (!isSignedIn) {
      setMaps([]);
      setLoadErr(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      if (!cancelled) {
        setLoadErr(initialHydrationError ?? null);
      }
      try {
        await loadMaps();
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
  }, [isSignedIn, topicFamily, loadMaps, initialHydrationError]);

  // Live updates via SSE — the global maps stream pushes status flips and
  // deletions, replacing the previous 4s polling loop. The hydration
  // effect above still runs on mount and on filter change for cold loads.
  const loadMapsRef = useRef(loadMaps);
  loadMapsRef.current = loadMaps;
  useEffect(() => {
    if (!isSignedIn) return;
    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1_000;

    const refresh = () => {
      void loadMapsRef.current().catch(() => {
        /* hydration / next event will retry */
      });
    };

    const handleMessage = (event: MessageEvent<string>) => {
      let parsed: MapsListFrame | null = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!parsed) return;
      if (parsed.type === "map_status") {
        const slug = parsed.slug;
        let known = false;
        setMaps((current) => {
          const next = current.map((m) => {
            if (m.slug !== slug) return m;
            known = true;
            return {
              ...m,
              status: parsed.status,
              isPublic: parsed.isPublic,
              updatedAt: parsed.updatedAt,
            };
          });
          return next;
        });
        if (!known) refresh();
      } else if (parsed.type === "map_deleted") {
        setMaps((current) => current.filter((m) => m.slug !== parsed.slug));
      }
    };

    const connect = () => {
      if (closed) return;
      if (typeof EventSource === "undefined") return;
      source = new EventSource("/api/maps/events");
      source.addEventListener("message", handleMessage as EventListener);
      source.addEventListener("open", () => {
        reconnectDelay = 1_000;
      });
      source.addEventListener("error", () => {
        if (closed) return;
        if (source && source.readyState === EventSource.CLOSED) {
          source.close();
          source = null;
          reconnectTimer = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (source) source.close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    const refreshLibrary = () => {
      void loadMaps().catch(() => {
        /* The regular hydration effect and SSE will retry. */
      });
    };
    window.addEventListener(LIBRARY_REFRESH_EVENT, refreshLibrary);
    return () => {
      window.removeEventListener(LIBRARY_REFRESH_EVENT, refreshLibrary);
    };
  }, [isSignedIn, loadMaps]);

  const handleMapDeleted = useCallback(
    (deletedSlug: string) => {
      setMaps((current) => current.filter((map) => map.slug !== deletedSlug));
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

  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 shrink-0 flex-col border-t border-border bg-background transition-[max-width,width] duration-200 md:h-full md:border-r md:border-t-0",
        collapsed
          ? "w-full md:max-h-none md:w-12 md:max-w-12"
          : "max-h-[44vh] w-full md:max-h-none md:w-[min(320px,30vw)] md:max-w-[min(320px,30vw)]",
      )}
      aria-label="My maps"
    >
      {!collapsed ? (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            My maps
          </p>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Collapse my maps"
            aria-expanded
            title="Collapse"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center border-b border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Expand my maps"
          aria-expanded={false}
          title="Expand"
        >
          <ChevronsRight className="h-4 w-4" aria-hidden />
        </button>
      )}

      {!collapsed ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loadErr ? (
            <p className="px-3 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              {loadErr}
            </p>
          ) : maps.length ? (
            <ul className="px-1 py-1">
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
          )}
        </div>
      ) : null}
    </aside>
  );
}
