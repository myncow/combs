import Link from "next/link";
import { MapCard } from "@/components/map-card";
import { Button } from "@/components/ui/button";
import { EmptyStatePanel, PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import { mapFiltersSchema } from "@/lib/schema";
import { getPageByKey, listMaps } from "@/lib/store";

const PAGE_SIZE = 24;

function paramValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const queryRaw = paramValue(params.q).trim().slice(0, 160);
  const topicFamilyRaw = paramValue(params.topicFamily).trim();

  const parsed = mapFiltersSchema.safeParse({
    topicFamily: topicFamilyRaw || undefined,
    sort: typeof params.sort === "string" ? params.sort : "recent",
    page: typeof params.page === "string" ? params.page : "1",
    pageSize: PAGE_SIZE,
    status: "live",
    q: queryRaw || undefined,
  });
  const filters = parsed.success
    ? parsed.data
    : mapFiltersSchema.parse({
        topicFamily: undefined,
        sort: "recent",
        page: "1",
        pageSize: PAGE_SIZE,
        status: "live",
      });

  const { items, total } = await listMaps({
    topicFamily: filters.topicFamily,
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status ?? "live",
    publicOnly: true,
    query: filters.q,
  });
  const pageContent = await getPageByKey("gallery");
  if (pageContent?.key !== "gallery") {
    throw new Error("Gallery page content is missing.");
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = new URLSearchParams();
  if (filters.q) baseParams.set("q", filters.q);
  if (filters.topicFamily) baseParams.set("topicFamily", filters.topicFamily);
  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(baseParams);
    next.set("page", String(nextPage));
    return `/gallery?${next.toString()}`;
  };

  const filterSummaryParts: string[] = [];
  if (filters.q) filterSummaryParts.push(`Search · "${filters.q}"`);
  if (filters.topicFamily) filterSummaryParts.push(`Family · ${filters.topicFamily}`);

  return (
    <ShellPage size="content">
      <PageHeader
        eyebrow={`${total} ${total === 1 ? "map" : "maps"}`}
        title={pageContent.heading}
        intro={pageContent.intro}
        summary={filterSummaryParts.length ? filterSummaryParts.join(" · ") : `Page ${filters.page} of ${pageCount}`}
        titleClassName="text-[26px] md:text-[34px]"
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
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Search
              </Button>
              {filters.q || filters.topicFamily ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href="/gallery">Reset</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </SurfacePanel>

        {items.length === 0 ? (
          <EmptyStatePanel
            kicker={filters.q || filters.topicFamily ? "No matches" : "No public maps yet"}
            body={
              filters.q || filters.topicFamily
                ? "Try a different search or clear the filter."
                : "Once a map is published publicly it will show up here."
            }
            actions={
              filters.q || filters.topicFamily ? (
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
