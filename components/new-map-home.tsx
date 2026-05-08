import { CreateMapForm } from "@/components/create-map-form";

export function NewMapHome() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-6 md:px-8 md:py-10">
      <header className="shrink-0 border-b border-border pb-5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary tabular-nums">
            01
          </span>
          <span aria-hidden className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Topic
          </span>
        </div>
        <h1 className="mt-3.5 font-sans text-[22px] font-semibold leading-tight tracking-[-0.025em] text-foreground md:text-[26px]">
          New map
        </h1>
        <p className="mt-1.5 max-w-[36rem] font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Topic <span className="text-foreground/40">·</span> Frame <span className="text-foreground/40">·</span> Build
        </p>
      </header>
      <div className="mt-6 flex shrink-0 flex-col">
        <CreateMapForm />
      </div>
    </main>
  );
}
