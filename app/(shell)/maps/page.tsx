import Link from "next/link";
import { Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyStatePanel, ShellPage, StickyToolbar } from "@/components/raster-shell";
import { getSessionUser } from "@/lib/auth/admin";
import { mapFiltersSchema } from "@/lib/schema";
import { getPageByKey, listMaps } from "@/lib/store";
import { cn, pickMapThumbnail, simplifyMapDisplayTitle } from "@/lib/utils";

type MapsScope = "new" | "mine";

const SCOPE_VALUES = new Set<MapsScope>(["new", "mine"]);

const SCOPE_LABEL: Record<MapsScope, string> = {
  new: "Latest",
  mine: "Mine",
};

const SCOPE_ICON: Record<MapsScope, typeof Sparkles> = {
  new: Sparkles,
  mine: User,
};

const PAGE_SIZE = 10;

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildHref(params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `/maps?${qs}` : "/maps";
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
    icon: typeof Sparkles;
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

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const queryRaw = paramValue(params.q).trim().slice(0, 160);
  const topicFamilyRaw = paramValue(params.topicFamily).trim();
  const user = await getSessionUser();

  const rawScope = paramValue(params.scope).toLowerCase();
  let scope: MapsScope = SCOPE_VALUES.has(rawScope as MapsScope)
    ? (rawScope as MapsScope)
    : "new";
  if (scope === "mine" && !user) {
    scope = "new";
  }

  // Map the URL-level scope onto the existing `mapFiltersSchema` `sort`
  // and the store-level `ownerId` filter. Gallery only ever lists by recency.
  const scopeSort = "recent" as const;

  const parsed = mapFiltersSchema.safeParse({
    topicFamily: topicFamilyRaw || undefined,
    sort: scopeSort,
    page: typeof params.page === "string" ? params.page : "1",
    pageSize: PAGE_SIZE,
    status: "live",
    q: queryRaw || undefined,
  });
  const filters = parsed.success
    ? parsed.data
    : mapFiltersSchema.parse({
        topicFamily: undefined,
        sort: scopeSort,
        page: "1",
        pageSize: PAGE_SIZE,
        status: "live",
      });

  // Mine = signed-in user's library across all visibilities; otherwise
  // restrict to public maps so the gallery stays the public catalog.
  const isMine = scope === "mine" && !!user;

  const { items, total } = await listMaps({
    topicFamily: filters.topicFamily,
    page: filters.page,
    pageSize: filters.pageSize,
    status: isMine ? "library" : filters.status ?? "live",
    publicOnly: !isMine,
    ownerId: isMine ? user?.id : undefined,
    query: filters.q,
    sort: filters.sort,
  });
  const pageContent = await getPageByKey("gallery");
  if (pageContent?.key !== "gallery") {
    throw new Error("Gallery page content is missing.");
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = new URLSearchParams();
  if (filters.q) baseParams.set("q", filters.q);
  if (filters.topicFamily) baseParams.set("topicFamily", filters.topicFamily);
  if (scope !== "new") baseParams.set("scope", scope);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(baseParams);
    next.set("page", String(nextPage));
    return buildHref(next);
  };

  // Carrier params for the scope toggle so search/topic filters are
  // preserved across scope switches.
  const scopeCarry = new URLSearchParams();
  if (filters.q) scopeCarry.set("q", filters.q);
  if (filters.topicFamily) scopeCarry.set("topicFamily", filters.topicFamily);

  const eyebrowLabel = `${total} ${total === 1 ? "map" : "maps"}`;

  return (
    <ShellPage size="wide" className="gap-3 md:overflow-hidden">
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
            <form action="/maps" role="search" className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
              <input
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                placeholder="Search title, topic…"
                aria-label="Search maps"
                className="h-9 w-full min-w-0 border border-border bg-background px-2.5 font-sans text-[16px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-[12rem] md:w-[14rem] md:text-[12.5px]"
              />
              {filters.topicFamily ? (
                <input type="hidden" name="topicFamily" value={filters.topicFamily} />
              ) : null}
              {scope !== "new" ? <input type="hidden" name="scope" value={scope} /> : null}
            </form>
            <SegmentedNav<MapsScope>
              label="Filter maps"
              current={scope}
              paramName="scope"
              baseParams={scopeCarry}
              options={[
                { value: "new", label: SCOPE_LABEL.new, icon: SCOPE_ICON.new },
                {
                  value: "mine",
                  label: SCOPE_LABEL.mine,
                  icon: SCOPE_ICON.mine,
                  disabled: !user,
                  disabledHint: "Sign in to see your maps",
                },
              ]}
            />
          </div>
        </div>
      </StickyToolbar>

      <div className="-mx-5 flex flex-col gap-5 px-5 md:-mx-8 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:px-8">
        {items.length === 0 ? (
          <EmptyStatePanel
            kicker={
              scope === "mine"
                ? "No maps yet"
                : filters.q || filters.topicFamily
                  ? "No matches"
                  : "No public maps yet"
            }
            body={
              scope === "mine"
                ? "Start a new map to populate your library."
                : filters.q || filters.topicFamily
                  ? "Try a different search or clear the filter."
                  : "Once a map is published publicly it will show up here."
            }
            actions={
              scope === "mine" ? (
                <Button asChild>
                  <Link href="/create">New map</Link>
                </Button>
              ) : filters.q || filters.topicFamily ? (
                <Button asChild variant="outline">
                  <Link href="/maps">Clear filter</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="-mx-5 border-y border-border bg-card md:-mx-8">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[72px]">Map</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden w-[200px] md:table-cell">Topic</TableHead>
                  <TableHead className="hidden w-[180px] md:table-cell">Author</TableHead>
                  <TableHead className="w-[64px] text-right md:w-[88px]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((map) => {
                  const thumbnailUrl = map.thumbnailUrl ?? pickMapThumbnail(map.document);
                  const displayTitle = simplifyMapDisplayTitle(map.title, map.topicFamily);
                  const date = (() => {
                    try {
                      return new Date(map.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      });
                    } catch {
                      return "";
                    }
                  })();
                  return (
                    <TableRow key={map.id} className="group">
                      <TableCell>
                        <Link
                          href={`/maps/${map.slug}`}
                          aria-label={map.title}
                          className="block aspect-square h-10 w-10 shrink-0 overflow-hidden border border-border bg-muted"
                          tabIndex={-1}
                        >
                          {thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnailUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/maps/${map.slug}`}
                          className="block min-w-0 outline-none focus-visible:outline-none"
                        >
                          <h3 className="truncate text-[15px] font-semibold leading-tight tracking-[-0.005em] text-foreground transition-colors duration-150 group-hover:text-primary md:text-[16px]">
                            {displayTitle}
                          </h3>
                          <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:hidden">
                            {map.topicFamily}
                            {map.createdByDisplayName ? (
                              <>
                                <span className="mx-1.5 text-muted-foreground/50">·</span>
                                <span className="normal-case tracking-normal">
                                  by {map.createdByDisplayName}
                                </span>
                              </>
                            ) : null}
                          </p>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="truncate font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          {map.topicFamily}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="truncate text-[13px] text-muted-foreground">
                          {map.createdByDisplayName ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <time
                          dateTime={map.createdAt}
                          className="font-mono text-[11px] tabular-nums uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          {date}
                        </time>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {pageCount > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
        >
          {filters.page <= 1 ? (
            <span aria-disabled="true" className="opacity-50">
              ← Prev
            </span>
          ) : (
            <Link href={pageHref(filters.page - 1)} className="hover:text-foreground">
              ← Prev
            </Link>
          )}
          <span>
            Page {filters.page} of {pageCount}
          </span>
          {filters.page >= pageCount ? (
            <span aria-disabled="true" className="opacity-50">
              Next →
            </span>
          ) : (
            <Link href={pageHref(filters.page + 1)} className="hover:text-foreground">
              Next →
            </Link>
          )}
        </nav>
      ) : null}
    </ShellPage>
  );
}
