"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={signInHref}>Sign in</Link>
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
