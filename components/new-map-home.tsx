import { CreateMapForm } from "@/components/create-map-form";
import { PageHeader, ShellPage, SurfacePanel } from "@/components/raster-shell";
import type { HomePageContent } from "@/lib/types";

export function NewMapHome({ content }: { content?: HomePageContent | null }) {
  const heading = content?.heroTitle ?? "New map";

  return (
    <ShellPage size="content" className="overflow-hidden py-4 md:py-5">
      <PageHeader
        title={heading}
        intro="Pick a category. Two axes slice it into a grid. Empty cells are gaps you can fill."
        titleClassName="text-[22px] md:text-[28px]"
        introClassName="max-w-[42rem] text-[13.5px]"
        className="pb-3 md:pb-4"
      />
      <SurfacePanel className="mt-4 min-w-0">
        <CreateMapForm />
      </SurfacePanel>
    </ShellPage>
  );
}
