"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50dvh] w-full max-w-lg flex-col justify-center px-5 py-16 md:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Error</p>
      <h1 className="mt-2 font-sans text-2xl font-semibold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        {error.message || "An unexpected error occurred. You can try again or go back home."}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" variant="default" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">New map</Link>
        </Button>
      </div>
    </main>
  );
}
