"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@neondatabase/auth/react";
import { Button } from "@/components/ui/button";
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
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href={signUpHref}>Create account</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href={signInHref}>Sign in</Link>
          </Button>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="flex shrink-0 items-center justify-end">
          <UserButton />
        </div>
      </SignedIn>
    </>
  );
}
