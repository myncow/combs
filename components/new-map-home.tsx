import { CreateMapForm } from "@/components/create-map-form";

export function NewMapHome() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col px-5 py-4 md:px-8 md:py-6">
      <header className="shrink-0 border-b border-border/70 pb-2 md:pb-3">
        <h1 className="font-sans text-[21px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[24px]">
          New map
        </h1>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground md:text-[13px]">
          Start with a topic. Suggested axes appear as you type, and the table is generated dynamically after you submit.
        </p>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3 md:pt-4">
        <CreateMapForm />
      </div>
    </main>
  );
}
