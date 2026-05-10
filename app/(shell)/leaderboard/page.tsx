import Link from "next/link";
import { connection } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { leaderboardFiltersSchema } from "@/lib/schema";
import { getPageByKey, listLeaderboardEntries, listLeaderboardTopicFamilies } from "@/lib/store";
import { LeaderboardCard } from "@/components/leaderboard-card";
import { AsciiDivider } from "@/components/ui/ascii-divider";
import { Badge } from "@/components/ui/badge";

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
    pageSize: 12,
  });
  const filters = parsed.success
    ? parsed.data
    : leaderboardFiltersSchema.parse({
        topicFamily: undefined,
        sort: "top",
        page: "1",
        pageSize: 12,
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

  const [featured, ...rest] = entries.items;

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-5 py-8 md:px-8 md:py-10">
      <header className="border-b border-border pb-6">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary tabular-nums">
            01
          </span>
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground tabular-nums">
            {String(entries.total).padStart(2, "0")} {entries.total === 1 ? "spotlight" : "spotlights"}
          </span>
        </div>
        <h1 className="mt-4 font-sans text-[26px] font-semibold leading-tight tracking-[-0.025em] text-foreground md:text-[32px]">
          {pageContent.heading}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          {pageContent.intro}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {pageContent.helperText}
          </span>
          <Link
            href={`/leaderboard?sort=top${filters.topicFamily ? `&topicFamily=${encodeURIComponent(filters.topicFamily)}` : ""}`}
            className={
              "border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors " +
              (filters.sort === "top"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground")
            }
          >
            Top
          </Link>
          <Link
            href={`/leaderboard?sort=new${filters.topicFamily ? `&topicFamily=${encodeURIComponent(filters.topicFamily)}` : ""}`}
            className={
              "border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors " +
              (filters.sort === "new"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground")
            }
          >
            New
          </Link>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <Badge variant={!filters.topicFamily ? "default" : "muted"} className="px-3 py-1.5">
            <Link href={`/leaderboard?sort=${filters.sort}`}>All</Link>
          </Badge>
          {topicFamilies.map((family) => (
            <Badge
              key={family}
              variant={filters.topicFamily === family ? "accent" : "muted"}
              className="px-3 py-1.5"
            >
              <Link href={`/leaderboard?sort=${filters.sort}&topicFamily=${encodeURIComponent(family)}`}>
                {family}
              </Link>
            </Badge>
          ))}
        </div>
      </header>

      {featured ? <LeaderboardCard entry={featured} rank={1} featured /> : null}

      {rest.length ? (
        <>
          <AsciiDivider />
          <div className="grid gap-5">
            {rest.map((entry, index) => (
              <LeaderboardCard
                key={entry.id}
                entry={entry}
                rank={(filters.page - 1) * filters.pageSize + index + 2}
              />
            ))}
          </div>
        </>
      ) : featured ? null : (
        <div className="border border-border bg-card px-5 py-10 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {pageContent.emptyStateTitle}
          </p>
          {pageContent.emptyStateBody ? (
            <p className="mt-3 text-[14px] text-muted-foreground">{pageContent.emptyStateBody}</p>
          ) : null}
        </div>
      )}
    </main>
  );
}
