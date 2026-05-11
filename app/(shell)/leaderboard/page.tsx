import Link from "next/link";
import { connection } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { EmptyStatePanel, PageHeader, ShellPage } from "@/components/raster-shell";
import { leaderboardFiltersSchema } from "@/lib/schema";
import { getPageByKey, listLeaderboardEntries, listLeaderboardTopicFamilies } from "@/lib/store";
import { LeaderboardGallery } from "@/components/leaderboard-gallery";

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button asChild size="sm" variant={active ? "default" : "secondary"}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const requesterId = await getRequesterId();
  const params = await searchParams;
  const parsed = leaderboardFiltersSchema.safeParse({
    topicFamily: typeof params.topicFamily === "string" ? params.topicFamily : undefined,
    sort: typeof params.sort === "string" ? params.sort : "top",
    page: typeof params.page === "string" ? params.page : "1",
    pageSize: 24,
  });
  const filters = parsed.success
    ? parsed.data
    : leaderboardFiltersSchema.parse({
        topicFamily: undefined,
        sort: "top",
        page: "1",
        pageSize: 24,
      });
  const [entries, topicFamilies] = await Promise.all([
    listLeaderboardEntries({
      topicFamily: filters.topicFamily,
      sort: filters.sort,
      page: filters.page,
      pageSize: filters.pageSize,
      requesterId,
    }),
    listLeaderboardTopicFamilies(),
  ]);
  const pageContent = await getPageByKey("leaderboard");
  if (pageContent?.key !== "leaderboard") {
    throw new Error("Leaderboard page content is missing.");
  }

  const pageStart = (filters.page - 1) * filters.pageSize + 1;

  return (
    <ShellPage size="wide" className="gap-8">
      <PageHeader
        index="03"
        title={pageContent.heading}
        eyebrow={`${String(entries.total).padStart(2, "0")} ${entries.total === 1 ? "spotlight" : "spotlights"}`}
        intro={pageContent.intro}
        titleClassName="text-[26px] md:text-[34px]"
        actions={
          <>
            <FilterLink
              href={`/leaderboard?sort=top${filters.topicFamily ? `&topicFamily=${encodeURIComponent(filters.topicFamily)}` : ""}`}
              active={filters.sort === "top"}
            >
              Top
            </FilterLink>
            <FilterLink
              href={`/leaderboard?sort=new${filters.topicFamily ? `&topicFamily=${encodeURIComponent(filters.topicFamily)}` : ""}`}
              active={filters.sort === "new"}
            >
              New
            </FilterLink>
            <span aria-hidden className="mx-1 hidden h-4 w-px bg-border md:block" />
            <FilterLink href={`/leaderboard?sort=${filters.sort}`} active={!filters.topicFamily}>
              All
            </FilterLink>
            {topicFamilies.map((family) => (
              <FilterLink
                key={family}
                href={`/leaderboard?sort=${filters.sort}&topicFamily=${encodeURIComponent(family)}`}
                active={filters.topicFamily === family}
              >
                {family}
              </FilterLink>
            ))}
          </>
        }
      />

      {entries.items.length ? (
        <LeaderboardGallery entries={entries.items} pageStart={pageStart} />
      ) : (
        <EmptyStatePanel
          kicker={pageContent.emptyStateTitle}
          body={pageContent.emptyStateBody}
          actions={
            <>
              <Button asChild>
                <Link href="/">New map</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/gallery">Maps</Link>
              </Button>
            </>
          }
        />
      )}
    </ShellPage>
  );
}
