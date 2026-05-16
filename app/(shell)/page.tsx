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

const GALLERY_PAGE_SIZE = 6;
// One fewer than what fits the viewport at common heights — keeps the
// list-view column from spawning its own inner scrollbar.
const LIST_PAGE_SIZE = 9;

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
    <ShellPage size="wide" className="gap-3 overflow-hidden">
      {/* Toolbar + pagination are pinned siblings; only the middle list
          region scrolls. ShellPage's default overflow-y-auto is
          overridden above so the page itself never scrolls — the user
          can always see filters and pagination without hunting. */}
      <StickyToolbar>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="font-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-foreground md:text-[24px]">
              Finds
            </h1>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
              {eyebrowLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form
              action="/"
              role="search"
              className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none"
            >
              <input
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search title, category…"
                aria-label="Search leaderboard"
                className="h-9 w-full min-w-0 border border-border bg-background px-2.5 font-sans text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-[12rem] md:w-[14rem]"
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

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(13rem,15rem)] md:gap-8">
        <section className="flex min-h-0 flex-col gap-3 overflow-hidden">
          {!user ? (
            <p className="font-sans text-[13px] leading-snug text-muted-foreground">
              Each entry is a <span className="italic text-foreground">find</span> — a gap someone surfaced from a Lelet map. Upvote the strong ones, or{" "}
              <Link href="/auth/sign-in" className="text-foreground underline-offset-4 hover:underline">
                sign in
              </Link>{" "}
              to publish your own.
            </p>
          ) : null}
          {/* Mobile-only context strip — on md+ this copy lives in the
              right aside; below md the aside is hidden, so surface a
              one-line framing + about link here. */}
          <div className="flex items-center justify-between gap-3 border border-border bg-card px-3 py-2 md:hidden">
            <p className="min-w-0 font-sans text-[12px] leading-snug text-muted-foreground">
              <span className="italic text-foreground">Lelet</span> maps a topic across two traits. The empty cells become finds.
            </p>
            <Link
              href="/about"
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              About →
            </Link>
          </div>

          <div className="-mx-5 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 md:mx-0 md:px-0">
            {entries.items.length ? (
              <LeaderboardGallery
                entries={entries.items}
                view={view}
                isSignedIn={Boolean(user)}
                viewerId={user?.id ?? null}
                viewerIsAdmin={Boolean(user?.isAdmin)}
                bleed={false}
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
                    ? `Nothing on the wall matches "${query}". Try a different search or clear it.`
                    : scope === "mine"
                      ? "Publish a find from any of your maps to see them here."
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
                        <Link href="/maps">Maps</Link>
                      </Button>
                    </>
                  )
                }
              />
            )}
          </div>

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
        </section>

        <aside
          aria-label="About the wall"
          className="hidden border-l border-border pl-6 pt-2 md:flex md:flex-col md:gap-4"
        >
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              What's this?
            </p>
            <p className="mt-2 font-sans text-[12.5px] leading-[1.55] text-foreground">
              <span className="italic">Lelet</span> maps a topic across two
              picturable traits. The cells nothing fills become finds — gaps
              worth keeping.
            </p>
          </div>
          <div className="border-t border-border pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              The wall
            </p>
            <p className="mt-2 font-sans text-[12.5px] leading-[1.55] text-muted-foreground">
              Each card below is one find, published from a map. Upvote the
              ones that feel right.
            </p>
          </div>
          <div className="mt-auto border-t border-border pt-3">
            <Link
              href="/about"
              className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              More about Lelet →
            </Link>
          </div>
        </aside>
      </div>
    </ShellPage>
  );
}
