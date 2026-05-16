"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { authClient } from "@/lib/auth/client";
import { DEFAULT_POST_AUTH_REDIRECT } from "@/lib/auth/redirect";

type AuthUILink = ComponentType<{ href: string; className?: string; children: ReactNode }>;

const AuthUILinkAdapter: AuthUILink = ({ href, className, children }) => (
  <NextLink href={href} className={className}>
    {children}
  </NextLink>
);

/**
 * Watches the auth session and re-fetches the active route on every
 * sign-in / sign-out transition so server-rendered chrome (sidebar,
 * scope tabs, account menu, etc.) reflects the new auth state.
 *
 * `serverKnownSignedIn` is the auth state the server used to render this
 * page; if the client's first observation disagrees we refresh once so
 * stale server output doesn't linger after a hard-nav sign-in.
 */
function AuthRefreshOnChange({ serverKnownSignedIn }: { serverKnownSignedIn: boolean }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const lastSignedInRef = useRef<boolean | null>(null);
  const didInitialReconcileRef = useRef(false);

  useEffect(() => {
    if (isPending) return;
    const signedIn = Boolean(session?.user);
    const previous = lastSignedInRef.current;
    lastSignedInRef.current = signedIn;

    if (previous === null) {
      if (!didInitialReconcileRef.current && signedIn !== serverKnownSignedIn) {
        didInitialReconcileRef.current = true;
        router.refresh();
      }
      return;
    }
    if (previous === signedIn) return;
    router.refresh();
  }, [isPending, session, router, serverKnownSignedIn]);

  return null;
}

export function NeonAuthProviders({
  children,
  serverKnownSignedIn,
}: {
  children: ReactNode;
  serverKnownSignedIn: boolean;
}) {
  const router = useRouter();

  const navigate = useCallback((href: string) => router.push(href), [router]);
  const replace = useCallback((href: string) => router.replace(href), [router]);
  const onSessionChange = useCallback(() => router.refresh(), [router]);

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      social={{ providers: ["google"] }}
      navigate={navigate}
      replace={replace}
      Link={AuthUILinkAdapter}
      redirectTo={DEFAULT_POST_AUTH_REDIRECT}
      onSessionChange={onSessionChange}
    >
      <AuthRefreshOnChange serverKnownSignedIn={serverKnownSignedIn} />
      {children}
    </NeonAuthUIProvider>
  );
}
