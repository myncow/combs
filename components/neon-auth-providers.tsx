"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * Watches the auth session and re-fetches the active route on every
 * sign-in / sign-out transition so server-rendered chrome (the sidebar,
 * leaderboard scope tabs, vote controls, account menu, etc.) reflects
 * the new auth state without a manual reload.
 *
 * Lives inside the provider so `authClient.useSession()` has its
 * context available. It renders nothing.
 */
function AuthRefreshOnChange() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const lastSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (isPending) return;
    const signedIn = Boolean(session?.user);
    const previous = lastSignedInRef.current;
    lastSignedInRef.current = signedIn;
    // Skip the initial settle — only react to actual transitions.
    if (previous === null) return;
    if (previous === signedIn) return;
    router.refresh();
  }, [isPending, session, router]);

  return null;
}

export function NeonAuthProviders({ children }: { children: ReactNode }) {
  return (
    <NeonAuthUIProvider authClient={authClient} social={{ providers: ["google"] }}>
      <AuthRefreshOnChange />
      {children}
    </NeonAuthUIProvider>
  );
}
