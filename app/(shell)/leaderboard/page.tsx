import Link from "next/link";
import { connection } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { EmptyStatePanel, PageHeader, ShellPage } from "@/components/raster-shell";
import { getPageByKey, listLeaderboardEntries } from "@/lib/store";
import { LeaderboardGallery } from "@/components/leaderboard-gallery";
import type { LeaderboardSort } from "@/lib/types";
import { cn } from "@/lib/utils";

function SortToggle({ current }: { current: LeaderboardSort }) {
  const options: Array<{ value: LeaderboardSort; label: string }> = [
    { value: "top", label: "Top" },
    { value: "new", label: "Latest" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Sort spotlights"
      className="inline-flex items-center border border-border bg-card"
    >
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={`/leaderboard?sort=${option.value}`}
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

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  await connection();
  const requesterId = await getRequesterId();
  const { sort: sortParam } = await searchParams;
  const sort: LeaderboardSort = sortParam === "new" ? "new" : "top";
  const entries = await listLeaderboardEntries({
    sort,
    page: 1,
    pageSize: 48,
    requesterId,
  });
  const pageContent = await getPageByKey("leaderboard");
  if (pageContent?.key !== "leaderboard") {
    throw new Error("Leaderboard page content is missing.");
  }

  return (
    <ShellPage size="wide" className="gap-8">
      <PageHeader
        title={pageContent.heading}
        eyebrow={`${entries.total} ${entries.total === 1 ? "spotlight" : "spotlights"}`}
        intro={pageContent.intro}
        titleClassName="text-[26px] md:text-[34px]"
        actions={<SortToggle current={sort} />}
      />

      {entries.items.length ? (
        <LeaderboardGallery entries={entries.items} />
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
