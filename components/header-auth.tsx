"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { buildAuthRedirectHref } from "@/lib/auth/redirect";

export function HeaderAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const signInHref = buildAuthRedirectHref("/auth/sign-in", pathname, searchParams);

  if (isPending) {
    return (
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground" aria-live="polite">
        …
      </span>
    );
  }

  if (!session?.user) {
    return (
      <div className="ml-auto flex max-w-[min(100%,24rem)] flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.25} />
          <span>Signed out</span>
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link href={signInHref}>Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="ml-auto flex max-w-[min(100%,28rem)] flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <User className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.25} />
        <span className="shrink-0">Signed in</span>
      </span>
      <Button variant="ghost" size="sm" className="max-w-[11rem] truncate normal-case tracking-normal font-sans text-[13px]" asChild>
        <Link href="/account" title={session.user.email ?? "Account"}>
          {session.user.name}
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={async () => {
          await authClient.signOut();
          router.refresh();
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
