"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@neondatabase/auth/react";
import { Button } from "@/components/ui/button";
import { SignedInIcon, SignedOutIcon } from "@/components/auth-status-icon";
import { buildAuthRedirectHref } from "@/lib/auth/redirect";

export function HeaderAuth() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const signInHref = buildAuthRedirectHref("/auth/sign-in", pathname, searchParams);
  const signUpHref = buildAuthRedirectHref("/auth/sign-up", pathname, searchParams);

  return (
    <>
      <SignedOut>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <span
            className="hidden items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline-flex"
            title="You are signed out"
          >
            <SignedOutIcon className="text-muted-foreground" />
            <span className="sr-only lg:not-sr-only">Signed out</span>
          </span>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href={signUpHref}>Create account</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href={signInHref}>Sign in</Link>
          </Button>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <span
            className="hidden items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground lg:inline-flex"
            title="Signed in"
          >
            <SignedInIcon className="text-foreground" />
            <span>Signed in</span>
          </span>
          <UserButton />
        </div>
      </SignedIn>
    </>
  );
}
