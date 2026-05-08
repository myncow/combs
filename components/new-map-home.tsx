import { CreateMapForm } from "@/components/create-map-form";
import type { HomePageContent } from "@/lib/types";

export function NewMapHome({ content }: { content?: HomePageContent | null }) {
  const heading = content?.heroTitle ?? "New map";
  const body = content?.heroBody ?? "Turn a topic into a structured map of examples, gaps, and constraints.";
  const eyebrow = content?.sectionEyebrow ?? "Topic";
  const summary = content?.sectionSummary ?? "Topic · Frame · Build";

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-6 md:px-8 md:py-10">
      <header className="shrink-0 border-b border-border pb-5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary tabular-nums">
            01
          </span>
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </span>
        </div>
        <h1 className="mt-3.5 font-sans text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground md:text-[26px]">
          {heading}
        </h1>
        <p className="mt-1.5 max-w-[36rem] text-[14px] leading-relaxed text-muted-foreground">
          {body}
        </p>
        <p className="mt-2 max-w-[36rem] font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {summary}
        </p>
      </header>
      <div className="mt-6 flex shrink-0 flex-col">
        <CreateMapForm />
      </div>
    </main>
  );
}
