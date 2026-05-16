import { AuthView } from "@neondatabase/auth/react";
import { DEFAULT_POST_AUTH_REDIRECT, sanitizeRedirectTo } from "@/lib/auth/redirect";

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    "sign-in",
    "sign-up",
    "forgot-password",
    "reset-password",
    "magic-link",
    "two-factor",
    "callback",
    "sign-out",
  ].map((path) => ({ path }));
}

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ path }, sp] = await Promise.all([params, searchParams]);
  const raw = sp.redirectTo;
  const fromUrl = sanitizeRedirectTo(Array.isArray(raw) ? raw[0] : raw);
  const redirectTo = fromUrl === "/" ? DEFAULT_POST_AUTH_REDIRECT : fromUrl;

  return (
    <main className="flex w-full flex-1 items-center justify-center overflow-y-auto overscroll-contain px-5 py-10 md:px-8 md:py-14">
      <div className="w-full max-w-[420px]">
        <AuthView path={path} redirectTo={redirectTo} />
      </div>
    </main>
  );
}
