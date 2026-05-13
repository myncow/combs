import Link from "next/link";
import { MapCard } from "@/components/map-card";
import { Button } from "@/components/ui/button";
import { EmptyStatePanel, PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import { getSessionUser } from "@/lib/auth/admin";
import { mapFiltersSchema } from "@/lib/schema";
import { getPageByKey, listMaps } from "@/lib/store";
import { cn } from "@/lib/utils";

type MapsScope = "top" | "new" | "mine";

const SCOPE_VALUES = new Set<MapsScope>(["top", "new", "mine"]);

const SCOPE_LABEL: Record<MapsScope, string> = {
  top: "Top",
  new: "Latest",
  mine: "Mine",
};

const PAGE_SIZE = 24;

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildHref(params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `/gallery?${qs}` : "/gallery";
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
  options: Array<{ value: T; label: string; disabled?: boolean }>;
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
        const active = option.value === current;
        if (option.disabled) {
          return (
            <span
              key={option.value}
              aria-disabled="true"
              className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground/60"
              title="Sign in to filter your maps"
            >
              {option.label}
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
            className={cn(
              "px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
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
  // and the store-level `ownerId` filter.
  const scopeSort = scope === "top" ? "top" : "recent";

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

  const filterSummaryParts: string[] = [];
  if (filters.q) filterSummaryParts.push(`Search · "${filters.q}"`);
  if (filters.topicFamily) filterSummaryParts.push(`Family · ${filters.topicFamily}`);

  // Carrier params for the scope toggle so search/topic filters are
  // preserved across scope switches.
  const scopeCarry = new URLSearchParams();
  if (filters.q) scopeCarry.set("q", filters.q);
  if (filters.topicFamily) scopeCarry.set("topicFamily", filters.topicFamily);

  return (
    <ShellPage size="content">
      <PageHeader
        eyebrow={`${total} ${total === 1 ? "map" : "maps"}`}
        title={pageContent.heading}
        intro={pageContent.intro}
        summary={filterSummaryParts.length ? filterSummaryParts.join(" · ") : `Page ${filters.page} of ${pageCount}`}
        titleClassName="text-[26px] md:text-[34px]"
        actions={
          <SegmentedNav<MapsScope>
            label="Filter maps"
            current={scope}
            paramName="scope"
            baseParams={scopeCarry}
            options={[
              { value: "top", label: SCOPE_LABEL.top },
              { value: "new", label: SCOPE_LABEL.new },
              { value: "mine", label: SCOPE_LABEL.mine, disabled: !user },
            ]}
          />
        }
      />
      <div className="mt-6 grid gap-5">
        <SurfacePanel padded={false}>
          <form
            action="/gallery"
            className="grid gap-3 px-5 py-4 md:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
          >
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Search public maps
              </span>
              <input
                name="q"
                defaultValue={filters.q ?? ""}
                autoComplete="off"
                placeholder="Title, topic, family, slug…"
                className="mt-1 h-9 w-full border-b border-border bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            {filters.topicFamily ? (
              <input type="hidden" name="topicFamily" value={filters.topicFamily} />
            ) : null}
            {scope !== "new" ? <input type="hidden" name="scope" value={scope} /> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Search
              </Button>
              {filters.q || filters.topicFamily ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/gallery${scope !== "new" ? `?scope=${scope}` : ""}`}>Reset</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </SurfacePanel>

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
                  <Link href="/gallery">Clear filter</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <SurfacePanel padded={false}>
            <ul className="divide-y divide-border px-5 md:px-6">
              {items.map((map) => (
                <li key={map.id}>
                  <MapCard map={map} />
                </li>
              ))}
            </ul>
          </SurfacePanel>
        )}

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
      </div>
    </ShellPage>
  );
}
