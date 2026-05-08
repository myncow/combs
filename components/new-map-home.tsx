import { CreateMapForm } from "@/components/create-map-form";

export function NewMapHome() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col px-5 py-6 md:px-8 md:py-10">
      <h1 className="shrink-0 font-sans text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[26px]">
        New map
      </h1>
      <p className="mt-1.5 max-w-[36rem] shrink-0 text-[14px] leading-snug text-muted-foreground">
        Type a topic. Pick a frame, or leave open for auto. Build to generate.
      </p>
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <CreateMapForm />
      </div>
    </main>
  );
}
