import Link from "next/link";
import { connection } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { Button } from "@/components/ui/button";
import { EmptyStatePanel, PageHeader, ShellPage } from "@/components/raster-shell";
import { getPageByKey, listLeaderboardEntries } from "@/lib/store";
import { LeaderboardGallery } from "@/components/leaderboard-gallery";

export default async function LeaderboardPage() {
  await connection();
  const requesterId = await getRequesterId();
  const entries = await listLeaderboardEntries({
    sort: "new",
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
        index="03"
        title={pageContent.heading}
        eyebrow={`${String(entries.total).padStart(2, "0")} ${entries.total === 1 ? "spotlight" : "spotlights"}`}
        intro={pageContent.intro}
        titleClassName="text-[26px] md:text-[34px]"
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
