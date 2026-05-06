export default function GalleryLoading() {
  return (
    <main className="mx-auto w-full max-w-lg px-5 py-6 md:px-8 md:py-8">
      <div className="h-8 w-40 animate-pulse rounded-sm bg-muted/60 md:h-9" />
      <div className="mt-3 h-16 w-full animate-pulse rounded-sm bg-muted/35" />
      <div className="mt-4 h-4 w-24 animate-pulse rounded-sm bg-muted/40" />
    </main>
  );
}
