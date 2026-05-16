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

  return getNeonAuthProxy()(request, ...args);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};
