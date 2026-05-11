"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyStatePanel, ShellPage } from "@/components/raster-shell";
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
    <ShellPage size="narrow" className="justify-center py-16">
      <EmptyStatePanel
        kicker="Error"
        title="Something went wrong"
        body={error.message || "An unexpected error occurred. You can try again or go back home."}
        actions={
          <>
            <Button type="button" variant="default" onClick={() => reset()}>
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/">New map</Link>
            </Button>
          </>
        }
      />
    </ShellPage>
  );
}
