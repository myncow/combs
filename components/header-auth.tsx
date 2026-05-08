"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LogOut, Settings, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { buildAuthRedirectHref } from "@/lib/auth/redirect";
import { cn } from "@/lib/utils";

const ICON_BUTTON_CLASSES =
  "inline-flex h-9 w-9 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const ACCOUNT_BUTTON_CLASSES =
  "inline-flex h-9 max-w-[14rem] items-center gap-2 border border-border bg-background pl-2 pr-2.5 text-foreground transition-colors duration-150 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function deriveDisplayName(user: { name?: string | null; email?: string | null }): string {
  const name = user.name?.trim();
  if (name) return name;
  if (user.email) {
    const local = user.email.split("@")[0] ?? user.email;
    return local;
  }
  return "Account";
}

export function HeaderAuth() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const signInHref = buildAuthRedirectHref("/auth/sign-in", pathname, searchParams);

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as { name?: string | null; email?: string | null } | undefined;
  const isSignedIn = Boolean(user);
  const isSettled = !isPending;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  // Pre-hydration: render a fixed-height slot so the header height doesn't
  // jump. Width is allowed to settle once the session resolves — that's a
  // single one-shot shift, not an in-session shift.
  if (!isSettled) {
    return <div aria-hidden className="flex h-9 w-9 shrink-0" />;
  }

  if (!isSignedIn || !user) {
    return (
      <Link
        href={signInHref}
        aria-label="Sign in"
        title="Sign in"
        className={cn(ICON_BUTTON_CLASSES, "shrink-0")}
      >
        <UserIcon className="h-4 w-4" aria-hidden strokeWidth={1.75} />
      </Link>
    );
  }

  const displayName = deriveDisplayName(user);

  async function handleSignOut() {
    setOpen(false);
    try {
      await authClient.signOut();
    } finally {
      router.refresh();
      router.push("/");
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        title={user.email ?? displayName}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          ACCOUNT_BUTTON_CLASSES,
          open && "border-foreground/40",
        )}
      >
        <UserIcon
          className="h-3.5 w-3.5 shrink-0 text-foreground"
          aria-hidden
          strokeWidth={1.5}
          fill="currentColor"
        />
        <span className="min-w-0 truncate text-[13px] font-medium leading-none tracking-[-0.005em] text-foreground">
          {displayName}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 origin-top-right border border-border bg-card shadow-md"
        >
          {user.email ? (
            <div className="border-b border-border px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Signed in as
              </p>
              <p className="mt-0.5 truncate text-[13px] text-foreground" title={user.email}>
                {user.email}
              </p>
            </div>
          ) : null}
          <Link
            href="/account/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-foreground/[0.04]"
          >
            <Settings className="h-3.5 w-3.5 text-muted-foreground" aria-hidden strokeWidth={1.75} />
            Account
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-foreground/[0.04]"
          >
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" aria-hidden strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
