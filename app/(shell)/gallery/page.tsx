import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyStatePanel, PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import { mapFiltersSchema } from "@/lib/schema";
import { getPageByKey, listMaps } from "@/lib/store";

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = mapFiltersSchema.safeParse({
    topicFamily: typeof params.topicFamily === "string" ? params.topicFamily : undefined,
    sort: typeof params.sort === "string" ? params.sort : "recent",
    page: typeof params.page === "string" ? params.page : "1",
    pageSize: 24,
    status: "live",
  });
  const filters = parsed.success
    ? parsed.data
    : mapFiltersSchema.parse({
        topicFamily: undefined,
        sort: "recent",
        page: "1",
        pageSize: 24,
        status: "live",
      });

  const { total } = await listMaps({
    topicFamily: filters.topicFamily,
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status ?? "live",
    publicOnly: true,
  });
  const pageContent = await getPageByKey("gallery");
  if (pageContent?.key !== "gallery") {
    throw new Error("Gallery page content is missing.");
  }

  return (
    <ShellPage size="content">
      <PageHeader
        eyebrow={total === 1 ? "01 map" : `${String(total).padStart(2, "0")} maps`}
        title={pageContent.heading}
        intro={pageContent.intro}
        summary={filters.topicFamily ? `Filtered · ${filters.topicFamily}` : "Library · Rail browsing"}
        titleClassName="text-[26px] md:text-[34px]"
      />
      <div className="mt-6 grid gap-5">
        <SurfacePanel>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Reading Mode
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                Titles and thumbnails stay in the left rail so you can keep the active canvas open while jumping between maps.
              </p>
              {filters.topicFamily ? (
                <p className="mt-3 text-[14px] leading-relaxed text-foreground">
                  Current family: <span className="font-medium">{filters.topicFamily}</span>.{" "}
                  <Link href="/gallery" className="underline decoration-border underline-offset-4 hover:text-primary">
                    Clear filter
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/">New map</Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/leaderboard">Top list</Link>
              </Button>
            </div>
          </div>
        </SurfacePanel>

        {total === 0 ? (
          <EmptyStatePanel
            kicker="No maps yet"
            body="Start a map from the rail or the new-map screen, then use this view as a stable library index."
            actions={
              <>
                <Button asChild>
                  <Link href="/">New map</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/leaderboard">Browse spotlights</Link>
                </Button>
              </>
            }
          />
        ) : null}
      </div>
    </ShellPage>
  );
}
