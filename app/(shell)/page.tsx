import Link from "next/link";
import { connection } from "next/server";
import { Flame, LayoutGrid, List as ListIcon, Sparkles, User } from "lucide-react";
import { getSessionUser } from "@/lib/auth/admin";
import { getVoterIdentity } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { EmptyStatePanel, ShellPage, StickyToolbar } from "@/components/raster-shell";
import { getPageByKey, listLeaderboardEntries } from "@/lib/store";
import { LeaderboardGallery } from "@/components/leaderboard-gallery";
import type { LeaderboardSort } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type LeaderboardScope = "top" | "new" | "mine";
type LeaderboardView = "list" | "gallery";

const SCOPE_VALUES = new Set<LeaderboardScope>(["top", "new", "mine"]);
const VIEW_VALUES = new Set<LeaderboardView>(["list", "gallery"]);

const SCOPE_LABEL: Record<LeaderboardScope, string> = {
  top: "Top",
  new: "Latest",
  mine: "Mine",
};

const SCOPE_ICON: Record<LeaderboardScope, typeof Flame> = {
  top: Flame,
  new: Sparkles,
  mine: User,
};

const VIEW_LABEL: Record<LeaderboardView, string> = {
  list: "List",
  gallery: "Gallery",
};

const VIEW_ICON: Record<LeaderboardView, typeof LayoutGrid> = {
  list: ListIcon,
  gallery: LayoutGrid,
};

const GALLERY_PAGE_SIZE = 24;
const LIST_PAGE_SIZE = 48;

function buildHref(params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function SegmentedNav<T extends string>({
  label,
  current,
  options,
  paramName,
  baseParams,
}: {
  label: string;
  current: T;
  options: Array<{
    value: T;
    label: string;
    icon: typeof Flame;
    disabled?: boolean;
    disabledHint?: string;
  }>;
  paramName: string;
  baseParams: URLSearchParams;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex items-center border border-border bg-card"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === current;
        if (option.disabled) {
          return (
            <span
              key={option.value}
              aria-disabled="true"
              aria-label={option.label}
              title={option.disabledHint ?? option.label}
              className="inline-flex h-9 items-center justify-center gap-1.5 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/40"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
              <span>{option.label}</span>
            </span>
          );
        }
        const next = new URLSearchParams(baseParams);
        next.set(paramName, option.value);
        next.delete("page");
        return (
          <Link
            key={option.value}
            href={buildHref(next)}
            scroll={false}
            role="tab"
            aria-selected={active}
            aria-label={option.label}
            title={option.label}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 px-3 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
            <span>{option.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    sort?: string;
    view?: string;
    page?: string;
    spotlight?: string;
    q?: string;
  }>;
}) {
  await connection();
  const requesterId = await getVoterIdentity();
  const user = await getSessionUser();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 160);

  // `sort` (legacy) still narrows top vs. latest; `scope` is the new
  // three-way toggle (top / latest / mine). When `scope` is missing we
  // fall back to `sort` for backward compat with old shared links.
  const rawScope = (params.scope ?? params.sort ?? "top").toLowerCase();
  let scope: LeaderboardScope = SCOPE_VALUES.has(rawScope as LeaderboardScope)
    ? (rawScope as LeaderboardScope)
    : "top";
  if (scope === "mine" && !user) {
    // Mine requires a signed-in session; degrade gracefully to "Latest".
    scope = "new";
  }

  // List is the default — it's the densest overview of the leaderboard
  // and the user's first read of the landing page should be "what's
  // here", not "look at one big card".
  const rawView = (params.view ?? "list").toLowerCase();
  const view: LeaderboardView = VIEW_VALUES.has(rawView as LeaderboardView)
    ? (rawView as LeaderboardView)
    : "list";

  const pageSize = view === "list" ? LIST_PAGE_SIZE : GALLERY_PAGE_SIZE;
  const pageRaw = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const storeSort: LeaderboardSort = scope === "top" ? "top" : "new";

  const [entries, pageContent] = await Promise.all([
    listLeaderboardEntries({
      sort: storeSort,
      page,
      pageSize,
      requesterId,
      ownerId: scope === "mine" ? user?.id : undefined,
      query: query || undefined,
    }),
    getPageByKey("leaderboard"),
  ]);

  if (pageContent?.key !== "leaderboard") {
    throw new Error("Leaderboard page content is missing.");
  }

  const pageCount = Math.max(1, Math.ceil(entries.total / pageSize));

  // Carrier for inter-control links so toggling scope keeps view, and
  // pagination keeps both. `page` is intentionally stripped by callers.
  const baseParams = new URLSearchParams();
  baseParams.set("scope", scope);
  baseParams.set("view", view);
  if (query) baseParams.set("q", query);

  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(baseParams);
    next.set("page", String(nextPage));
    return buildHref(next);
  };

  const eyebrowLabel =
    scope === "mine"
      ? `${entries.total} ${entries.total === 1 ? "entry" : "entries"} by you`
      : `${entries.total} ${entries.total === 1 ? "entry" : "entries"}`;

  return (
    <ShellPage size="wide" className="gap-5">
      {/* Sticky toolbar — pinned to the top of the scrollable shell so
          filter chrome stays accessible while the user scans entries.
          `StickyToolbar` pulls itself flush with the bottom of the site
          header so no scrolling content peeks through the join. */}
      <StickyToolbar>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="font-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-foreground md:text-[24px]">
              {pageContent.heading}
            </h1>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
              {eyebrowLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form
              action="/"
              role="search"
              className="flex items-center gap-1"
            >
              <input
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search title, category…"
                aria-label="Search leaderboard"
                className="h-9 w-[10rem] border border-border bg-background px-2.5 font-sans text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:w-[14rem]"
              />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="view" value={view} />
            </form>
            {/* Filter + view toggles are signed-in-only interactions —
                they let people slice the leaderboard by their own entries
                and switch between dense list / spotlight gallery. For
                signed-out visitors we keep the page focused on the
                content + the "New map" CTA below. Search stays visible
                because it works for anyone. */}
            {user ? (
              <>
                <SegmentedNav<LeaderboardScope>
                  label="Filter leaderboard"
                  current={scope}
                  paramName="scope"
                  baseParams={(() => {
                    const carry = new URLSearchParams();
                    carry.set("view", view);
                    return carry;
                  })()}
                  options={[
                    { value: "top", label: SCOPE_LABEL.top, icon: SCOPE_ICON.top },
                    { value: "new", label: SCOPE_LABEL.new, icon: SCOPE_ICON.new },
                    {
                      value: "mine",
                      label: SCOPE_LABEL.mine,
                      icon: SCOPE_ICON.mine,
                    },
                  ]}
                />
                <SegmentedNav<LeaderboardView>
                  label="Leaderboard view"
                  current={view}
                  paramName="view"
                  baseParams={(() => {
                    const carry = new URLSearchParams();
                    carry.set("scope", scope);
                    return carry;
                  })()}
                  options={[
                    { value: "list", label: VIEW_LABEL.list, icon: VIEW_ICON.list },
                    { value: "gallery", label: VIEW_LABEL.gallery, icon: VIEW_ICON.gallery },
                  ]}
                />
              </>
            ) : null}
          </div>
        </div>
      </StickyToolbar>

      {entries.items.length ? (
        <LeaderboardGallery
          entries={entries.items}
          view={view}
          isSignedIn={Boolean(user)}
          viewerId={user?.id ?? null}
          viewerIsAdmin={Boolean(user?.isAdmin)}
        />
      ) : (
        <EmptyStatePanel
          kicker={
            query
              ? "No matches"
              : scope === "mine"
                ? "Nothing published yet"
                : pageContent.emptyStateTitle
          }
          body={
            query
              ? `Nothing on the leaderboard matches "${query}". Try a different search or clear it.`
              : scope === "mine"
                ? "Publish to the leaderboard from any of your maps to see them here."
                : pageContent.emptyStateBody
          }
          actions={
            query ? (
              <Button asChild variant="outline">
                <Link href={`/?scope=${scope}&view=${view}`}>Clear search</Link>
              </Button>
            ) : (
              <>
                <Button asChild>
                  <Link href="/create">New map</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/gallery">Maps</Link>
                </Button>
              </>
            )
          }
        />
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
        >
          {page <= 1 ? (
            <span aria-disabled="true" className="opacity-50">
              ← Prev
            </span>
          ) : (
            <Link href={pageHref(page - 1)} className="hover:text-foreground">
              ← Prev
            </Link>
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page >= pageCount ? (
            <span aria-disabled="true" className="opacity-50">
              Next →
            </span>
          ) : (
            <Link href={pageHref(page + 1)} className="hover:text-foreground">
              Next →
            </Link>
          )}
        </nav>
      ) : null}
    </ShellPage>
  );
}
