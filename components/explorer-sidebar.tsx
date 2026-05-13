"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Plus, Shield, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MapCard, isMapEnriching } from "@/components/map-card";
import { LIBRARY_REFRESH_EVENT } from "@/lib/client-events";
import { entryTransition } from "@/lib/motion";
import type { SavedMap } from "@/lib/types";
import { cn } from "@/lib/utils";

type MapsPayload = { items?: SavedMap[]; total?: number };

export type ExplorerSidebarProps = {
  isSignedIn: boolean;
  isAdmin?: boolean;
  initialMaps?: { items: SavedMap[]; total: number };
  /** Set when server-side library load threw — shown until client refresh succeeds. */
  initialHydrationError?: string;
};

export function ExplorerSidebar({
  isSignedIn,
  isAdmin = false,
  initialMaps,
  initialHydrationError,
}: ExplorerSidebarProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/";
  const topicFamily = searchParams.get("topicFamily") ?? undefined;
  const reduceMotion = useReducedMotion() ?? false;

  const [collapsed, setCollapsed] = useState(false);
  const [maps, setMaps] = useState<SavedMap[]>(() => initialMaps?.items ?? []);
  const [loadErr, setLoadErr] = useState<string | null>(() => initialHydrationError ?? null);

  const loadMaps = useCallback(async () => {
    const qs = new URLSearchParams({ pageSize: "48", sort: "recent", status: "library", page: "1" });
    if (topicFamily) qs.set("topicFamily", topicFamily);
    const res = await fetch(`/api/maps?${qs}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("Maps request failed");
    }
    const data = (await res.json()) as MapsPayload;
    setMaps(Array.isArray(data.items) ? data.items : []);
  }, [topicFamily]);

  useEffect(() => {
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
  }, [topicFamily, loadMaps, initialHydrationError]);

  // Keep polling while ANY map is mid-generation OR in the post-publish
  // enrichment window (SerpAPI is still fetching reference images in the
  // background). Without the latter, the sidebar's "Searching examples"
  // indicator would never refresh away after the time window elapses.
  const hasActiveWork = maps.some(
    (m) => m.status === "generating" || isMapEnriching(m),
  );
  useEffect(() => {
    if (!hasActiveWork) return;
    const handle = window.setInterval(() => {
      void loadMaps().catch(() => {
        /* swallow — next tick retries */
      });
    }, 4000);
    return () => window.clearInterval(handle);
  }, [hasActiveWork, loadMaps]);

  useEffect(() => {
    const refreshLibrary = () => {
      void loadMaps().catch(() => {
        /* The regular hydration effect and polling will retry. */
      });
    };
    window.addEventListener(LIBRARY_REFRESH_EVENT, refreshLibrary);
    return () => {
      window.removeEventListener(LIBRARY_REFRESH_EVENT, refreshLibrary);
    };
  }, [loadMaps]);

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

  const isLeaderboardActive = pathname.startsWith("/leaderboard");
  const isHomeActive = pathname === "/";
  const isAdminActive = pathname.startsWith("/admin");

  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 shrink-0 flex-col border-t border-border bg-background transition-[max-width,width] duration-200 md:h-full md:border-r md:border-t-0",
        collapsed
          ? "w-full md:max-h-none md:w-12 md:max-w-12"
          : "max-h-[44vh] w-full md:max-h-none md:w-[min(320px,30vw)] md:max-w-[min(320px,30vw)]",
      )}
      aria-label={isSignedIn ? "My maps" : "Maps"}
    >
      <div
        className={cn(
          "flex shrink-0 flex-col border-b border-border bg-card/40",
          collapsed ? "gap-1 p-1.5" : "gap-1 px-2 py-2",
        )}
      >
        <SidebarNavLink
          href="/"
          icon={<Plus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden strokeWidth={2.5} />}
          label="New map"
          active={isHomeActive}
          collapsed={collapsed}
        />
        <SidebarNavLink
          href="/leaderboard"
          icon={<Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.25} />}
          label="Top list"
          active={isLeaderboardActive}
          collapsed={collapsed}
        />
        {isAdmin ? (
          <SidebarNavLink
            href="/admin/maps"
            icon={<Shield className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden strokeWidth={2.25} />}
            label="Admin · all maps"
            active={isAdminActive}
            collapsed={collapsed}
          />
        ) : null}
      </div>

      {!collapsed ? (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {isSignedIn ? "My maps" : "Maps"}
          </p>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={isSignedIn ? "Collapse my maps" : "Collapse maps"}
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
          aria-label={isSignedIn ? "Expand my maps" : "Expand maps"}
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

function SidebarNavLink({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-2 border px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] transition-[border-color,background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:border-primary/35 hover:bg-[color:color-mix(in_srgb,var(--primary)_6%,var(--card))] hover:text-primary",
        collapsed && "md:h-9 md:w-9 md:justify-center md:px-0",
      )}
    >
      {icon}
      <span className={cn(collapsed && "md:hidden")}>{label}</span>
    </Link>
  );
}
