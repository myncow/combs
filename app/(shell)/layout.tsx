import { Suspense } from "react";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { hasDatabaseUrl } from "@/lib/db/client";
import type { ListedLeaderboardEntry, SavedMap } from "@/lib/types";
import { listLeaderboardEntries, listMaps } from "@/lib/store";

async function ExplorerSidebarLoader() {
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
      initialMaps={{ items: mapsResult.items, total: mapsResult.total }}
      initialLeaderboard={leaderboardItems}
      initialHydrationError={hydrationError}
    />
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
