import Link from "next/link";
import { ArrowRight, ArrowUpRight, Grid3X3, Sparkles } from "lucide-react";
import type { ListedLeaderboardEntry, SavedMap } from "@/lib/types";
import { pickMapThumbnail, simplifyMapDisplayTitle } from "@/lib/utils";

type SignedOutHomeProps = {
  signInHref: string;
  signUpHref?: string;
  leaderboardHref: string;
  galleryHref?: string;
  preview: ListedLeaderboardEntry[];
  mapPreview?: SavedMap[];
};

export function SignedOutHome({
  signUpHref,
  leaderboardHref,
  galleryHref = "/gallery",
  preview,
  mapPreview = [],
}: SignedOutHomeProps) {
  const resolvedSignUpHref = signUpHref ?? "/auth/sign-up";
  const cards = preview.slice(0, 4);
  const maps = mapPreview.slice(0, 5);
  const axisExamples = [
    ["Mushrooms", "Cap shape", "Gill density"],
    ["Sneakers", "Sole geometry", "Material texture"],
    ["Bird beaks", "Curve", "Length"],
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-12 overflow-y-auto overscroll-contain px-5 pb-12 pt-10 md:px-8 md:pb-16 md:pt-16">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div className="max-w-3xl">
        <h1 className="font-sans text-[40px] font-semibold leading-[0.98] tracking-[-0.035em] text-foreground md:text-[56px]">
          Browse maps
          <br />
          made from two axes.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-[1.6] text-muted-foreground md:text-[16px]">
          Explore public grids, inspect the frontier cells, and start your own map when a topic clicks.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href={galleryHref}
            className="group inline-flex h-11 items-center gap-2 border border-foreground bg-foreground px-5 font-mono text-[12px] uppercase tracking-[0.22em] text-background transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
          >
            Browse maps
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.25}
              aria-hidden
            />
          </Link>
          <Link
            href={resolvedSignUpHref}
            className="inline-flex h-11 items-center gap-2 border border-border bg-card px-5 font-mono text-[12px] uppercase tracking-[0.22em] text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Start a map
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
        </div>
        <div className="border border-border bg-card/70 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            How it reads
          </p>
          <div className="mt-4 grid grid-cols-3 gap-px bg-border">
            {["Known", "Rare", "Gap", "Known", "Tension", "Gap", "Rare", "Known", "Ruled out"].map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="flex aspect-square items-end bg-background p-2"
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Each cell asks what belongs at the crossing of two visual traits.
          </p>
        </div>
      </section>

      {maps.length > 0 ? (
        <section aria-label="Public maps">
          <div className="flex items-end justify-between gap-3 pb-3">
            <h2 className="tagline text-[14px] text-muted-foreground">
              Public maps
            </h2>
            <Link
              href={galleryHref}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors hover:text-primary"
            >
              View all
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {maps.map((map) => (
              <li key={map.id}>
                <Link
                  href={`/maps/${map.slug}`}
                  className="group flex items-center gap-3 py-3 transition-colors hover:bg-foreground/[0.03]"
                >
                  <span className="flex h-12 w-12 shrink-0 overflow-hidden border border-border bg-muted">
                    {map.thumbnailUrl ?? pickMapThumbnail(map.document) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={(map.thumbnailUrl ?? pickMapThumbnail(map.document))!}
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
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
                      {simplifyMapDisplayTitle(map.title, map.topicFamily)}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {map.topicFamily}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Example axis pairs">
        <div className="flex items-center gap-2 pb-3">
          <Grid3X3 className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="tagline text-[14px] text-muted-foreground">
            Axis pair examples
          </h2>
        </div>
        <ul className="grid gap-3 md:grid-cols-3">
          {axisExamples.map(([topic, x, y]) => (
            <li key={topic} className="border border-border bg-card/70 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {topic}
              </p>
              <p className="mt-3 text-[15px] font-semibold leading-snug text-foreground">
                {x}
                <span className="mx-2 text-muted-foreground">x</span>
                {y}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {cards.length > 0 ? (
        <section aria-label="Top spotlights">
          <div className="flex items-end justify-between gap-3 pb-3">
            <h2 className="tagline text-[14px] text-muted-foreground">
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
