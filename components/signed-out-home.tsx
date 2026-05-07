import Link from "next/link";
import { Lock } from "lucide-react";
import { LeaderboardCard } from "@/components/leaderboard-card";
import { Button } from "@/components/ui/button";
import type { ListedLeaderboardEntry } from "@/lib/types";

type SignedOutHomeProps = {
  signInHref: string;
  leaderboardHref: string;
  preview: ListedLeaderboardEntry[];
};

export function SignedOutHome({ signInHref, leaderboardHref, preview }: SignedOutHomeProps) {
  const [featured, ...rest] = preview;
  const supporting = rest.slice(0, 3);

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-5 py-6 md:px-8 md:py-8">
      <section className="border border-border bg-card p-5 md:p-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Raster</p>
        <h1 className="mt-3 max-w-3xl font-sans text-[28px] font-semibold leading-[0.98] tracking-[-0.03em] text-foreground md:text-[38px]">
          Two-axis visual maps for any topic
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-6 text-muted-foreground">
          Pick a category, pair two meaningful axes, and explore a grid of examples—then spotlight the most compelling
          frontier cells for others to browse and rank.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="default" asChild>
            <Link href={signInHref}>Sign in to build</Link>
          </Button>
          <Button variant="outline" size="default" asChild>
            <Link href={leaderboardHref}>View full top list</Link>
          </Button>
        </div>
        <p className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          Signed out — browse the top list; sign in to generate maps
        </p>
      </section>

      <section
        className="flex min-h-0 min-w-0 flex-col border border-border bg-card/35"
        aria-label="Locked builder preview"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
          <div>
            <p className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.22em] text-foreground/80">
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden strokeWidth={2.25} />
              Sign in to build maps
            </p>
            <p className="mt-1.5 max-w-[40rem] text-[13px] leading-snug text-muted-foreground">
              Map building unlocks topic input, live axis suggestions, and generation. Preview the layout here—interactive
              controls stay behind sign-in.
            </p>
          </div>
          <span className="shrink-0 border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Locked
          </span>
        </div>

        <div className="flex flex-col gap-5 px-4 py-4 md:px-5 md:py-5">
          <div className="shrink-0 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Topic</p>
              <p className="text-[12px] text-muted-foreground">Available when signed in</p>
            </div>
            <div
              className="flex min-h-[3.35rem] cursor-not-allowed items-center border border-dashed border-border/80 bg-muted/25 px-3 py-2 text-[clamp(1.15rem,3.5vw,1.5rem)] font-medium italic leading-[1.2] tracking-[-0.03em] text-muted-foreground/70 md:min-h-[3.75rem]"
              aria-hidden
            >
              Your topic appears here after you sign in
            </div>
          </div>

          <div className="space-y-3 border-t border-border/70 pt-4">
            <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Axis suggestions</p>
            <p className="text-[13px] leading-snug text-muted-foreground">
              Suggested axis pairs load as you type. This preview does not fetch suggestions or run generation.
            </p>
          </div>

          <div className="border-t border-border/70 pt-4">
            <Button className="w-full md:max-w-56" type="button" disabled variant="secondary">
              Build map
            </Button>
            <p className="mt-2 text-[12px] text-muted-foreground">
              <Link href={signInHref} className="text-foreground underline decoration-border underline-offset-4 hover:text-primary">
                Sign in
              </Link>{" "}
              to enable the builder.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-sans text-xl font-semibold tracking-[-0.02em] text-foreground md:text-2xl">
            Top list preview
          </h2>
          <Link
            href={leaderboardHref}
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            View all →
          </Link>
        </div>
        {featured ? (
          <>
            <LeaderboardCard entry={featured} rank={1} featured />
            {supporting.length ? (
              <div className="grid gap-5 md:grid-cols-1">
                {supporting.map((entry, index) => (
                  <LeaderboardCard key={entry.id} entry={entry} rank={index + 2} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="border border-border bg-card px-5 py-10 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">No spotlights yet.</p>
            <p className="mt-2 text-[13px] text-muted-foreground">When the community publishes, ranked spotlights appear here.</p>
          </div>
        )}
      </section>

      <section className="border border-border bg-card p-5 md:p-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">How it works</h2>
        <ol className="mt-4 space-y-4 text-[15px] leading-6 text-foreground">
          <li className="flex gap-3">
            <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">01</span>
            <span>
              <span className="font-semibold">Choose a topic</span>
              <span className="text-muted-foreground"> — name the category or scene you want mapped. Axis ideas arrive as you type.</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">02</span>
            <span>
              <span className="font-semibold">Inspect the grid</span>
              <span className="text-muted-foreground"> — walk the cells, compare examples, and refine how the axes read.</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">03</span>
            <span>
              <span className="font-semibold">Publish a spotlight</span>
              <span className="text-muted-foreground"> — elevate a standout cell to the ranked top list for others to vote on.</span>
            </span>
          </li>
        </ol>
      </section>
    </main>
  );
}
