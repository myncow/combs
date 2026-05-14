import Link from "next/link";
import { EmptyStatePanel, ShellPage } from "@/components/raster-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <ShellPage size="narrow" className="justify-center py-16">
      <EmptyStatePanel
        kicker="404"
        title="Page not found"
        body="That map or route does not exist, or it was removed."
        actions={
          <>
            <Button asChild variant="default">
              <Link href="/">New map</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/maps">Maps</Link>
            </Button>
          </>
        }
      />
    </ShellPage>
  );
}
