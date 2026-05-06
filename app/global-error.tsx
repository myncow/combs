"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Error</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            className="mt-8 inline-flex h-10 cursor-pointer items-center justify-center border border-foreground bg-foreground px-4 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-background transition-colors hover:bg-primary hover:text-primary-foreground"
            onClick={() => reset()}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
