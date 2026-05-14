import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShellPage } from "@/components/raster-shell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Lelet maps a topic across two picturable traits and surfaces the finds — the cells nothing has filled yet.",
};

export default function AboutPage() {
  return (
    <ShellPage size="content" className="gap-8 py-10 md:py-14">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          About
        </p>
        <h1 className="mt-3 font-sans text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[36px]">
          A map of what's missing.
        </h1>
        <p className="mt-3 max-w-[60ch] font-sans text-[15px] leading-[1.55] text-muted-foreground">
          <span className="italic text-foreground">Lelet</span>{" "}
          <span className="font-mono text-[12px] text-muted-foreground/70">/ˈlɛlɛt/</span>{" "}
          is Hungarian for a <em>find</em> — something uncovered through search.
        </p>
      </header>

      <section className="grid gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          What it does
        </h2>
        <p className="max-w-[60ch] font-sans text-[15px] leading-[1.6] text-foreground">
          Pick a topic. Lelet picks two picturable traits — the axes of a map —
          and fills in the grid with the examples that already exist. The cells
          that stay empty are the interesting ones: gaps, tensions, things
          that nothing quite fills yet.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Finds
        </h2>
        <p className="max-w-[60ch] font-sans text-[15px] leading-[1.6] text-foreground">
          When a gap is worth keeping, you can publish it as a <em>find</em>.
          Finds collect on the wall at the root of the site — visible to
          everyone, voted on by everyone, and traceable back to the map they
          came from.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Maps
        </h2>
        <p className="max-w-[60ch] font-sans text-[15px] leading-[1.6] text-foreground">
          Every find traces back to a map. Each map is a topic + two traits +
          the grid of examples that already exist. They're public catalogs of
          a small subject — useful on their own, useful for surfacing more
          finds.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
        <Button asChild>
          <Link href="/">See the wall of finds</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/create">Start a new map</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/maps">Browse maps</Link>
        </Button>
      </div>
    </ShellPage>
  );
}
