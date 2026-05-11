import { CreateMapForm } from "@/components/create-map-form";
import { PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import type { HomePageContent } from "@/lib/types";

export function NewMapHome({ content }: { content?: HomePageContent | null }) {
  const heading = content?.heroTitle ?? "New map";
  const body = content?.heroBody ?? "Turn a topic into a structured map of examples, gaps, and constraints.";
  const eyebrow = content?.sectionEyebrow ?? "Topic";
  const summary = content?.sectionSummary ?? "Topic · Frame · Build";

  return (
    <ShellPage size="content" className="py-6 md:py-8">
      <PageHeader
        title={heading}
        eyebrow={eyebrow}
        intro={body}
        summary={summary}
        titleClassName="text-[26px] md:text-[34px]"
        introClassName="max-w-[40rem]"
      />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <SurfacePanel className="min-w-0">
          <CreateMapForm />
        </SurfacePanel>
        <SurfacePanel tone="background" className="h-fit">
          <div className="space-y-5">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                First Screen
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                Start with a category that has visible variation. Narrower scenes produce sharper axes and better frontier cells.
              </p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Good Briefs
              </p>
              <ul className="mt-2 space-y-2 text-[14px] leading-relaxed text-foreground/88">
                <li>Pick something concrete enough to picture.</li>
                <li>Lock a suggested frame if one feels right.</li>
                <li>Use the rail to compare fresh maps quickly.</li>
              </ul>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </ShellPage>
  );
}
