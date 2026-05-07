import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ListedLeaderboardEntry } from "@/lib/types";

type SignedOutHomeProps = {
  signInHref: string;
  signUpHref?: string;
  leaderboardHref: string;
  preview: ListedLeaderboardEntry[];
};

export function SignedOutHome({
  signUpHref,
  leaderboardHref,
  preview,
}: SignedOutHomeProps) {
  const resolvedSignUpHref = signUpHref ?? "/auth/sign-up";
  const cards = preview.slice(0, 4);

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-14 overflow-y-auto overscroll-contain px-5 pb-12 pt-10 md:px-8 md:pb-16 md:pt-16">
      <section className="max-w-3xl">
        <h1 className="font-sans text-[40px] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground md:text-[56px]">
          Two-axis maps
          <br />
          for any topic.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-[1.6] text-muted-foreground md:text-[16px]">
          Pair two meaningful axes, explore a generated grid, publish the frontier cells.
        </p>
        <div className="mt-8">
          <Link
            href={resolvedSignUpHref}
            className="group inline-flex h-11 items-center gap-2 border border-foreground bg-foreground px-5 font-mono text-[12px] uppercase tracking-[0.22em] text-background transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
          >
            Get started
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.25}
              aria-hidden
            />
          </Link>
        </div>
      </section>

      {cards.length > 0 ? (
        <section aria-label="Top spotlights">
          <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Top spotlights
            </h2>
            <Link
              href={leaderboardHref}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors hover:text-primary"
            >
              View all
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            </Link>
          </div>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((entry, index) => (
              <li key={entry.slug}>
                <Link
                  href={`/leaderboard/${entry.slug}`}
                  className="group flex h-full flex-col border border-border bg-card transition-colors hover:border-foreground"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.imageUrl}
                      alt={entry.storyTitle}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <span className="tabular-nums">#{index + 1}</span>
                      <span className="truncate">{entry.topicFamily}</span>
                    </div>
                    <h3 className="font-sans text-[14px] font-semibold leading-snug tracking-[-0.015em] text-foreground transition-colors group-hover:text-primary">
                      {entry.storyTitle}
                    </h3>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
