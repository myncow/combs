"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedInIcon, SignedOutIcon } from "@/components/auth-status-icon";
import { UserAvatar } from "@/components/user-avatar";
import { authClient } from "@/lib/auth/client";
import { buildAuthRedirectHref } from "@/lib/auth/redirect";

export function HeaderAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const signInHref = buildAuthRedirectHref("/auth/sign-in", pathname, searchParams);
  const signUpHref = buildAuthRedirectHref("/auth/sign-up", pathname, searchParams);

  if (isPending) {
    return (
      <span
        className="shrink-0 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
        aria-live="polite"
      >
        …
      </span>
    );
  }

  if (!session?.user) {
    return (
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
    );
  }

  const user = session.user;

  return (
    <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
      <span
        className="hidden items-center gap-1.5 border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground lg:inline-flex"
        title="Signed in"
      >
        <SignedInIcon className="text-foreground" />
        <span>Signed in</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="group max-w-[10rem] gap-2 px-2 normal-case tracking-normal font-sans text-[13px] sm:max-w-[12rem]"
        asChild
      >
        <Link href="/account" title={user.email ?? "Account"}>
          <UserAvatar name={user.name} email={user.email} size="sm" />
          <span className="truncate">{user.name ?? user.email}</span>
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={async () => {
          await authClient.signOut();
          router.refresh();
        }}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
        <span className="sr-only md:not-sr-only">Sign out</span>
      </Button>
    </div>
  );
}
