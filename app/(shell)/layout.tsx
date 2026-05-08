import Link from "next/link";
import { Suspense } from "react";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { auth } from "@/lib/auth/server";
import { hasDatabaseUrl } from "@/lib/db/client";
import type { ListedLeaderboardEntry, SavedMap } from "@/lib/types";
import { listLeaderboardEntries, listMaps } from "@/lib/store";

export const dynamic = "force-dynamic";

async function ExplorerSidebarLoader() {
  const { data: session } = await auth.getSession();
  const isSignedIn = Boolean(session?.user);

  let mapsResult: { items: SavedMap[]; total: number } = { items: [], total: 0 };
  let leaderboardItems: ListedLeaderboardEntry[] = [];
  let hydrationError: string | undefined;

  if (hasDatabaseUrl()) {
    try {
      const [maps, leaderboard] = await Promise.all([
        listMaps({ pageSize: 48, status: "live", page: 1 }),
        listLeaderboardEntries({ pageSize: 24, sort: "top", page: 1 }),
      ]);
      mapsResult = maps;
      leaderboardItems = leaderboard.items;
    } catch (err) {
      hydrationError =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Could not load maps from the database.";
      console.error("ExplorerSidebarLoader failed:", err);
    }
  }

  return (
    <ExplorerSidebar
      isSignedIn={isSignedIn}
      initialMaps={{ items: mapsResult.items, total: mapsResult.total }}
      initialLeaderboard={leaderboardItems}
      initialHydrationError={hydrationError}
    />
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="order-2 md:order-1">
          <Suspense
            fallback={<aside className="hidden w-[min(360px,34vw)] shrink-0 border-r border-border md:block" />}
          >
            <ExplorerSidebarLoader />
          </Suspense>
        </div>
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">{children}</div>
      </div>
      <ShellFooter />
    </>
  );
}

function ShellFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="shrink-0 border-t border-border md:hidden">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-4 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground md:px-8">
        <Link href="/" className="hover:text-foreground">
          Raster · two-axis visual maps
        </Link>
        <span className="tabular-nums">{year}</span>
      </div>
    </footer>
  );
}
