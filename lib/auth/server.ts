import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getNeonAuthBaseUrl, getNeonAuthCookieSecret } from "@/lib/env";

let authInstance: ReturnType<typeof createNeonAuth> | null = null;

export function getAuth() {
  if (authInstance) {
    return authInstance;
  }

  const baseUrl = getNeonAuthBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "Neon Auth is not configured. Set VITE_NEON_AUTH_URL or NEON_AUTH_BASE_URL, or provide a Neon DATABASE_URL so the auth base URL can be derived automatically.",
    );
  }

  const cookieSecret = getNeonAuthCookieSecret();
  if (!cookieSecret) {
    throw new Error(
      "Neon Auth is not configured. Set NEON_AUTH_COOKIE_SECRET to a non-empty value for local development and Vercel deployments.",
    );
  }

  authInstance = createNeonAuth({
    baseUrl,
    cookies: {
      secret: cookieSecret,
    },
  });

  return authInstance;
}
