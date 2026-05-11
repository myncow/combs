"use client";

import { useEffect } from "react";
import "./globals.css";
import { EmptyStatePanel, ShellPage } from "@/components/raster-shell";
import { Button } from "@/components/ui/button";

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
        <ShellPage size="narrow" className="min-h-dvh justify-center py-16">
          <EmptyStatePanel
            kicker="Error"
            title="Something went wrong"
            body={error.message || "An unexpected error occurred."}
            actions={
              <Button type="button" onClick={() => reset()}>
                Try again
              </Button>
            }
          />
        </ShellPage>
      </body>
    </html>
  );
}
