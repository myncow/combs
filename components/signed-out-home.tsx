import Link from "next/link";
import { ArrowRight, ArrowUpRight, Grid3X3, LogIn, Sparkles, Trophy } from "lucide-react";
import type { ListedLeaderboardEntry, SavedMap } from "@/lib/types";
import { cn, pickMapThumbnail, simplifyMapDisplayTitle } from "@/lib/utils";

type SignedOutHomeProps = {
  signInHref: string;
  signUpHref?: string;
  leaderboardHref: string;
  galleryHref?: string;
  preview: ListedLeaderboardEntry[];
  mapPreview?: SavedMap[];
  /**
   * When true the hero collapses sign-in/up CTAs and surfaces "Start a new
   * map" linking to `/create`. The three preview panels render the same in
   * both states so the overview stays the universal landing surface.
   */
  isSignedIn?: boolean;
};

const AXIS_EXAMPLES = [
  ["Mushrooms", "Cap shape", "Gill density"],
  ["Sneakers", "Sole geometry", "Material texture"],
  ["Bird beaks", "Curve", "Length"],
] as const;

export function SignedOutHome({
  signInHref,
  signUpHref,
  leaderboardHref,
  galleryHref = "/gallery",
  preview,
  mapPreview = [],
  isSignedIn = false,
}: SignedOutHomeProps) {
  const resolvedSignUpHref = signUpHref ?? "/auth/sign-up";
  const cards = preview.slice(0, 6);
  const maps = mapPreview.slice(0, 12);

  return (
    // Page-level container fills the shell viewport (parent layout supplies
    // `flex-1 min-h-0`). `overflow-hidden` keeps the page itself from
    // scrolling — each panel below scrolls on its own.
    <main className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col gap-4 overflow-hidden px-5 py-4 md:px-8 md:py-6">
      <Hero
        galleryHref={galleryHref}
        signUpHref={resolvedSignUpHref}
        signInHref={signInHref}
        isSignedIn={isSignedIn}
      />

      {/* Three sticky-header / scroll-body panels. On mobile they stack and
          the outer page becomes scrollable (intentional fallback). */}
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-3 md:overflow-hidden">
        <Panel
          title="Public maps"
          icon={<Grid3X3 className="h-3.5 w-3.5 text-primary" aria-hidden />}
          actionHref={galleryHref}
          actionLabel="View all"
          empty={maps.length === 0 ? "No public maps yet." : undefined}
        >
          <ul className="divide-y divide-border">
            {maps.map((map) => (
              <li key={map.id}>
                <Link
                  href={`/maps/${map.slug}`}
                  className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.03]"
                >
                  <MapThumbnail map={map} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
                      {simplifyMapDisplayTitle(map.title, map.topicFamily)}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {map.topicFamily}
                      {map.createdByDisplayName ? <> · by {map.createdByDisplayName}</> : null}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Axis pair examples"
          icon={<Grid3X3 className="h-3.5 w-3.5 text-primary" aria-hidden />}
        >
          <ul className="divide-y divide-border">
            {AXIS_EXAMPLES.map(([topic, x, y]) => (
              <li key={topic} className="px-3 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {topic}
                </p>
                <p className="mt-1 text-[13.5px] font-semibold leading-snug text-foreground">
                  {x}
                  <span className="mx-1.5 text-muted-foreground">×</span>
                  {y}
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Top leaderboard entries"
          icon={<Trophy className="h-3.5 w-3.5 text-primary" aria-hidden />}
          actionHref={leaderboardHref}
          actionLabel="View all"
          empty={cards.length === 0 ? "No entries yet." : undefined}
        >
          <ul className="divide-y divide-border">
            {cards.map((entry, index) => (
              <li key={entry.slug}>
                <Link
                  href={`/leaderboard?spotlight=${encodeURIComponent(entry.slug)}`}
                  className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.03]"
                >
                  <span className="flex h-12 w-12 shrink-0 overflow-hidden border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <span className="tabular-nums">#{index + 1}</span>
                      <span className="truncate">{entry.topicFamily}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13.5px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                      {entry.storyTitle}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </main>
  );
}

function Hero({
  galleryHref,
  signUpHref,
  signInHref,
  isSignedIn,
}: {
  galleryHref: string;
  signUpHref: string;
  signInHref: string;
  isSignedIn: boolean;
}) {
  return (
    <section className="shrink-0 border border-border bg-card/50 p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h1 className="font-sans text-[22px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground md:text-[28px]">
            Browse maps made from two axes.
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-[1.5] text-muted-foreground">
            Explore public grids, inspect standout cells, start your own when a topic clicks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={galleryHref}
            className="group inline-flex h-9 items-center gap-1.5 border border-foreground bg-foreground px-3.5 font-mono text-[11px] uppercase tracking-[0.22em] text-background transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Browse maps
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} aria-hidden />
          </Link>
          {isSignedIn ? (
            <Link
              href="/create"
              className="inline-flex h-9 items-center gap-1.5 border border-border bg-card px-3.5 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start a new map
              <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            </Link>
          ) : (
            <>
              <Link
                href={signUpHref}
                className="inline-flex h-9 items-center gap-1.5 border border-border bg-card px-3.5 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Start a map
                <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              </Link>
              <Link
                href={signInHref}
                className="inline-flex h-9 items-center gap-1.5 border border-transparent px-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <LogIn className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Bounded panel: sticky header (visible while body scrolls), body fills the
 * remaining space and scrolls on overflow. Used for the three columns of the
 * signed-out home so the page itself stays viewport-locked.
 */
function Panel({
  title,
  icon,
  actionHref,
  actionLabel,
  empty,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  actionHref?: string;
  actionLabel?: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-h-0 flex-col border border-border bg-background"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-1.5">
          {icon}
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground">
            {title}
          </h2>
        </div>
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
          >
            {actionLabel ?? "View all"}
            <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          </Link>
        ) : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
        {empty ? (
          <p className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {empty}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function MapThumbnail({ map }: { map: SavedMap }) {
  const url = map.thumbnailUrl ?? pickMapThumbnail(map.document);
  return (
    <span className="flex h-12 w-12 shrink-0 overflow-hidden border border-border bg-muted">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden className="grid h-full w-full grid-cols-3 gap-px bg-border">
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} className="bg-background" />
          ))}
        </span>
      )}
    </span>
  );
}
