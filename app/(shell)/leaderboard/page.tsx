import Link from "next/link";
import { connection } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { leaderboardFiltersSchema } from "@/lib/schema";
import { listLeaderboardEntries, listLeaderboardTopicFamilies } from "@/lib/store";
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

  const [featured, ...rest] = entries.items;

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-5 py-6 md:px-8 md:py-8">
      <section className="border border-border bg-card p-5 md:p-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Top list</p>
        <h1 className="mt-3 max-w-3xl font-sans text-[34px] font-semibold leading-[0.98] tracking-[-0.03em] text-foreground md:text-[48px]">
          The best community-published frontier concepts, ranked by how compelling they feel.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-6 text-muted-foreground">
          These are not whole maps. Each spotlight isolates one promising frontier cell, pairs it with a generated image,
          and turns it into a shareable concept card that other people can vote up or down.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/leaderboard?sort=top${filters.topicFamily ? `&topicFamily=${encodeURIComponent(filters.topicFamily)}` : ""}`}
            className={
              "border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors " +
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
              "border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors " +
              (filters.sort === "new"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground")
            }
          >
            New
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant={!filters.topicFamily ? "default" : "muted"} className="px-3 py-2">
            <Link href={`/leaderboard?sort=${filters.sort}`}>All</Link>
          </Badge>
          {topicFamilies.map((family) => (
            <Badge
              key={family}
              variant={filters.topicFamily === family ? "accent" : "muted"}
              className="px-3 py-2"
            >
              <Link href={`/leaderboard?sort=${filters.sort}&topicFamily=${encodeURIComponent(family)}`}>
                {family}
              </Link>
            </Badge>
          ))}
        </div>
      </section>

      {featured ? (
        <>
          <AsciiDivider variant="label" label="Featured" />
          <LeaderboardCard entry={featured} rank={1} featured />
        </>
      ) : null}

      <section className="space-y-5">
        <AsciiDivider variant="label" label="More spotlights" />
        <div className="flex items-center justify-between gap-3">
          <h2 className="tagline text-2xl text-foreground">More spotlights</h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {entries.total === 1 ? "1 spotlight" : `${entries.total} spotlights`}
          </p>
        </div>

        {rest.length ? (
          <div className="grid gap-5">
            {rest.map((entry, index) => (
              <LeaderboardCard
                key={entry.id}
                entry={entry}
                rank={(filters.page - 1) * filters.pageSize + index + 2}
              />
            ))}
          </div>
        ) : featured ? null : (
          <div className="border border-border bg-card px-5 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              No spotlights yet.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
