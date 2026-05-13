import { ShellPage, SurfacePanel } from "@/components/raster-shell";

export default function MapPageLoading() {
  return (
    <ShellPage size="full" className="pb-8 md:overflow-hidden">
      <div className="border-b border-border pb-6">
        <div className="flex items-baseline gap-3">
          <div className="h-3 w-8 animate-pulse bg-muted/50" />
          <div className="h-px flex-1 bg-border" />
          <div className="h-3 w-20 animate-pulse bg-muted/40" />
        </div>
        <div className="mt-4 h-9 w-[min(100%,28rem)] animate-pulse bg-muted/60 sm:h-10" />
        <div className="mt-3 h-4 w-full max-w-xl animate-pulse bg-muted/35" />
      </div>
      <SurfacePanel className="mt-5 min-h-[320px] flex-1 animate-pulse border-border/60 bg-muted/20 md:min-h-[480px]">
        <div aria-hidden className="h-full w-full" />
      </SurfacePanel>
    </ShellPage>
  );
}
