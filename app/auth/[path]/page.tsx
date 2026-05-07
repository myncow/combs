import { AuthView } from "@neondatabase/auth/react";

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
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="flex w-full flex-1 items-center justify-center px-5 py-10 md:py-14">
      <AuthView path={path} />
    </main>
  );
}
