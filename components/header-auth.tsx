"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function HeaderAuth() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground" aria-live="polite">
        …
      </span>
    );
  }

  if (!session?.user) {
    return (
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/auth/sign-in">Sign in</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="ml-auto flex min-w-0 items-center gap-2">
      <Button variant="ghost" size="sm" className="max-w-[12rem] truncate normal-case tracking-normal font-sans text-[13px]" asChild>
        <Link href="/account" title={session.user.email}>
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
