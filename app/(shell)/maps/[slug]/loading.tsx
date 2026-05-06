export default function MapPageLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[1536px] flex-1 flex-col min-h-0 overflow-y-auto overscroll-contain px-5 pb-8 md:overflow-hidden md:pb-0 md:px-6 xl:px-8">
      <div className="shrink-0 py-3 lg:py-2">
        <div className="h-9 w-[min(100%,28rem)] animate-pulse rounded-sm bg-muted/60 sm:h-10" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col pb-3 md:pb-2">
        <div className="min-h-[320px] flex-1 animate-pulse rounded-md border border-border/60 bg-muted/20 md:min-h-[480px]" />
      </div>
    </main>
  );
}
