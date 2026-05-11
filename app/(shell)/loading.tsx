import { ShellPage, SurfacePanel } from "@/components/raster-shell";

export default function ShellLoading() {
  return (
    <ShellPage size="wide" className="overflow-hidden">
      <div className="border-b border-border pb-6">
        <div className="flex items-baseline gap-3">
          <div className="h-3 w-8 animate-pulse bg-muted/50" />
          <div className="h-px flex-1 bg-border" />
          <div className="h-3 w-24 animate-pulse bg-muted/40" />
        </div>
        <div className="mt-4 h-8 w-48 animate-pulse bg-muted/60 md:h-10 md:w-56" />
        <div className="mt-3 h-4 w-full max-w-md animate-pulse bg-muted/40" />
      </div>
      <SurfacePanel className="mt-6 min-h-[16rem] animate-pulse border-border/60 bg-muted/20">
        <div aria-hidden className="h-full w-full" />
      </SurfacePanel>
    </ShellPage>
  );
}
