export default function ShellLoading() {
  return (
    <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col min-h-0 overflow-hidden px-5 py-4 md:px-8 md:py-5">
      <div className="h-8 w-48 animate-pulse rounded-sm bg-muted/60 md:h-9 md:w-56" />
      <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-sm bg-muted/40" />
      <div className="mt-8 min-h-[200px] flex-1 animate-pulse rounded-md border border-border/60 bg-muted/25" />
    </main>
  );
}
