import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";

type NeonAuthProxy = ReturnType<ReturnType<typeof getAuth>["middleware"]>;
type NeonAuthProxyRestArgs = Parameters<NeonAuthProxy> extends [any, ...infer Rest] ? Rest : never;

let neonAuthProxy: NeonAuthProxy | null = null;

function getNeonAuthProxy() {
  if (!neonAuthProxy) {
    neonAuthProxy = getAuth().middleware({
      loginUrl: "/auth/sign-in",
    });
  }

  return neonAuthProxy;
}

function getCanonicalSiteUrl() {
  const raw = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function maybeRedirectToCanonicalHost(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return null;
  }

  const canonicalUrl = getCanonicalSiteUrl();
  if (!canonicalUrl) {
    return null;
  }

  const incomingUrl = request.nextUrl;
  if (!incomingUrl.hostname.endsWith(".vercel.app")) {
    return null;
  }

  if (incomingUrl.hostname === canonicalUrl.hostname) {
    return null;
  }

  const redirectUrl = new URL(request.url);
  redirectUrl.protocol = canonicalUrl.protocol;
  redirectUrl.host = canonicalUrl.host;

  return NextResponse.redirect(redirectUrl, 308);
}

export function proxy(request: NextRequest, ...args: NeonAuthProxyRestArgs) {
  const redirect = maybeRedirectToCanonicalHost(request);
  if (redirect) {
    return redirect;
  }

  // API routes handle their own auth and return JSON errors; the Neon Auth
  // middleware would otherwise 302 unauthenticated (or stale-session) API
  // calls to /auth/sign-in, breaking fetch/XHR clients.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Next.js Server Actions POST to the current page URL with a `Next-Action`
  // header. The Neon Auth middleware would 302 those to /auth/sign-in for any
  // session it can't verify, which the action client surfaces as the generic
  // "An unexpected response was received from the server" + React hydration
  // error #418. Every action (cell sketch, comments, votes, edits) checks
  // auth itself, so let action POSTs through.
  if (request.headers.get("next-action")) {
    return NextResponse.next();
  }

  return getNeonAuthProxy()(request, ...args);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};
