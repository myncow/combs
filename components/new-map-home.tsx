import { CreateMapForm } from "@/components/create-map-form";
import { PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import type { HomePageContent } from "@/lib/types";

export function NewMapHome({ content }: { content?: HomePageContent | null }) {
  const heading = content?.heroTitle ?? "New map";

  return (
    <ShellPage size="content" className="py-6 md:py-8">
      <PageHeader
        title={heading}
        intro="Pick a category. Two axes slice it into a grid. The empty cells are gaps you can fill with new images."
        titleClassName="text-[26px] md:text-[34px]"
        introClassName="max-w-[42rem]"
      />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <SurfacePanel className="min-w-0">
          <CreateMapForm />
        </SurfacePanel>
        <SurfacePanel tone="background" className="h-fit">
          <div className="space-y-5">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                How it works
              </p>
              <ol className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-foreground/88 [counter-reset:steps]">
                <li className="grid grid-cols-[auto_1fr] gap-x-2 [counter-increment:steps] before:font-mono before:text-[11px] before:text-muted-foreground before:content-[counter(steps)]">
                  <span>Type a category you can picture.</span>
                </li>
                <li className="grid grid-cols-[auto_1fr] gap-x-2 [counter-increment:steps] before:font-mono before:text-[11px] before:text-muted-foreground before:content-[counter(steps)]">
                  <span>Pick two visual axes — or define your own.</span>
                </li>
                <li className="grid grid-cols-[auto_1fr] gap-x-2 [counter-increment:steps] before:font-mono before:text-[11px] before:text-muted-foreground before:content-[counter(steps)]">
                  <span>Explore the grid. Empty cells are the gaps.</span>
                </li>
              </ol>
            </div>
            <div className="border-t border-border pt-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Good axes
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                Anything visually distinguishable: skin texture, color, morphology, habitat, locomotion, size.
              </p>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </ShellPage>
  );
}
