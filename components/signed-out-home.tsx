import Link from "next/link";
import { ArrowUpRight, Layers, Sparkles, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SignedOutIcon,
  UnlockHintIcon,
} from "@/components/auth-status-icon";
import type { ListedLeaderboardEntry } from "@/lib/types";

type SignedOutHomeProps = {
  signInHref: string;
  signUpHref?: string;
  leaderboardHref: string;
  preview: ListedLeaderboardEntry[];
};

const UNLOCKS = [
  {
    icon: Sparkles,
    title: "Live topic + axis suggestions",
    body: "Frames load as you type so the map shape forms before you submit.",
  },
  {
    icon: Layers,
    title: "Map generation + saved drafts",
    body: "Build the grid, return to it later — your library lives in the sidebar.",
  },
  {
    icon: Trophy,
    title: "Publish + vote on spotlights",
    body: "Promote a frontier cell to the top list and rank others' picks.",
  },
];

export function SignedOutHome({
  signInHref,
  signUpHref,
  leaderboardHref,
  preview,
}: SignedOutHomeProps) {
  const [featured] = preview;
  const resolvedSignUpHref = signUpHref ?? "/auth/sign-up";

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5 md:px-8 md:py-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
        <div className="relative overflow-hidden border border-border bg-card p-5 md:p-7">
          {/* subtle pixel-grid wash echoing the logo */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(0deg,var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:24px_24px]"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent" className="gap-1.5">
                <SignedOutIcon className="text-primary-foreground" />
                Signed-out preview
              </Badge>
              <Badge variant="muted">Top list stays live in the sidebar</Badge>
            </div>
            <h1 className="mt-4 max-w-3xl font-sans text-[28px] font-semibold leading-[0.98] tracking-[-0.03em] text-foreground md:text-[38px]">
              Two-axis visual maps for any topic
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-6 text-muted-foreground">
              Pick a category, pair two meaningful axes, and explore a grid of examples. When a frontier cell feels worth
              sharing, publish it as a spotlight for everyone else to browse and rank.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="default" asChild>
                <Link href={resolvedSignUpHref}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                  Create account
                </Link>
              </Button>
              <Button variant="outline" size="default" asChild>
                <Link href={signInHref}>Sign in</Link>
              </Button>
              <Button variant="ghost" size="default" asChild>
                <Link href={leaderboardHref}>
                  View full top list
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                </Link>
              </Button>
            </div>
            <p className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <SignedOutIcon className="text-muted-foreground" />
              Signed out — browse first, then unlock live generation
            </p>
          </div>
        </div>

        <section className="border border-border bg-background/70 p-5 md:p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">How it works</h2>
          <ol className="mt-4 space-y-4 text-[14px] leading-6 text-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">01</span>
              <span>
                <span className="font-semibold">Choose a topic</span>
                <span className="text-muted-foreground"> — name the category or scene you want mapped.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">02</span>
              <span>
                <span className="font-semibold">Inspect the grid</span>
                <span className="text-muted-foreground"> — compare cells, examples, and visual gaps.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">03</span>
              <span>
                <span className="font-semibold">Publish a spotlight</span>
                <span className="text-muted-foreground"> — promote a standout frontier cell into the ranking.</span>
              </span>
            </li>
          </ol>
        </section>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.85fr)]">
        <section
          className="flex min-h-0 min-w-0 flex-col border border-border bg-card/55"
          aria-label="Locked builder preview"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
            <div>
              <p className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.22em] text-foreground/80">
                <SignedOutIcon className="text-muted-foreground" />
                Sign in to build maps
              </p>
              <p className="mt-1.5 max-w-[38rem] text-[13px] leading-snug text-muted-foreground">
                The builder stays visible here so the flow still reads clearly, but topic entry, axis suggestions, and
                generation remain behind sign-in.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-background px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <SignedOutIcon className="text-muted-foreground" />
              Locked
            </span>
          </div>

          <div className="grid gap-4 px-4 py-4 md:px-5 md:py-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(17rem,0.92fr)]">
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Topic</p>
                  <p className="text-[12px] text-muted-foreground">Available when signed in</p>
                </div>
                <div
                  className="relative flex min-h-[4rem] cursor-not-allowed items-center overflow-hidden border border-dashed border-border/80 bg-background/55 px-3 py-3 text-[clamp(1.15rem,3vw,1.5rem)] font-medium italic leading-[1.2] tracking-[-0.03em] text-muted-foreground/72"
                  aria-hidden
                >
                  <span
                    className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card/55 via-card/15 to-transparent"
                    aria-hidden
                  />
                  Your topic appears here after you sign in
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-border bg-background/70 p-3">
                  <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Axis suggestions
                  </p>
                  <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
                    Suggested axis pairs start loading as you type, so the map shape forms early instead of after submit.
                  </p>
                </div>
                <div className="border border-border bg-background/70 p-3">
                  <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Output grid
                  </p>
                  <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
                    Generated cells, gap calls, and spotlight publishing all open once you authenticate.
                  </p>
                </div>
              </div>

              <div className="border-t border-border/70 pt-4">
                <Button className="w-full sm:w-auto sm:min-w-56" type="button" disabled variant="secondary">
                  <SignedOutIcon className="text-muted-foreground" />
                  Build map
                </Button>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  <Link
                    href={signInHref}
                    className="text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                  >
                    Sign in
                  </Link>{" "}
                  or{" "}
                  <Link
                    href={resolvedSignUpHref}
                    className="text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                  >
                    create an account
                  </Link>{" "}
                  to enable the builder.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="border border-border bg-background/75 p-3">
                <p className="inline-flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  <UnlockHintIcon className="text-foreground/85" />
                  What unlocks
                </p>
                <ul className="mt-3 space-y-2.5 text-[13px] leading-snug text-muted-foreground">
                  {UNLOCKS.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-2.5">
                      <Icon
                        className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden
                        strokeWidth={2.25}
                      />
                      <span>
                        <span className="block font-medium text-foreground">{title}</span>
                        <span className="block">{body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border border-border bg-background/75 p-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Top list preview
                    </p>
                    <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
                      Browse published spotlights now, then come back here to build your own.
                    </p>
                  </div>
                  <Link
                    href={leaderboardHref}
                    className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors hover:text-primary"
                  >
                    Open list
                    <ArrowUpRight className="h-3 w-3" aria-hidden strokeWidth={2.25} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border border-border bg-card" aria-label="Featured top list preview">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Current spotlight</p>
            <span
              aria-hidden
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Live
            </span>
          </div>
          {featured ? (
            <Link href={`/leaderboard/${featured.slug}`} className="group block">
              <div className="relative overflow-hidden border-b border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featured.imageUrl}
                  alt={featured.storyTitle}
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(0,0,0,0.55)_100%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                />
              </div>
              <div className="space-y-4 p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">#{1}</Badge>
                  <Badge variant="accent">{featured.topicFamily}</Badge>
                </div>
                <div>
                  <h2 className="font-sans text-[24px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground transition-colors group-hover:text-primary">
                    {featured.storyTitle}
                  </h2>
                  <p className="mt-3 text-[14px] leading-6 text-muted-foreground">{featured.storySummary}</p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {featured.mapTitle} · {featured.cellLabel}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors group-hover:text-primary">
                    View spotlight
                    <ArrowUpRight className="h-3 w-3" aria-hidden strokeWidth={2.25} />
                  </p>
                </div>
              </div>
            </Link>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">No spotlights yet.</p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                When the community publishes, the leading concept appears here.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
