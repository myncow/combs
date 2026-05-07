import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

const neonAuthProxy = auth.middleware({
  loginUrl: "/auth/sign-in",
});

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

export function proxy(request: NextRequest, ...args: Parameters<typeof neonAuthProxy> extends [any, ...infer Rest] ? Rest : never) {
  const redirect = maybeRedirectToCanonicalHost(request);
  if (redirect) {
    return redirect;
  }

  if (request.nextUrl.pathname.startsWith("/account")) {
    return neonAuthProxy(request, ...args);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};
