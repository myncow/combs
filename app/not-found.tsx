import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[50dvh] w-full max-w-lg flex-col justify-center px-5 py-16 md:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">404</p>
      <h1 className="mt-2 font-sans text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        That map or route does not exist, or it was removed.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="default">
          <Link href="/">New map</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/gallery">Maps</Link>
        </Button>
      </div>
    </main>
  );
}
