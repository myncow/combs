import { AuthView } from "@neondatabase/auth/react";
import { SurfacePanel } from "@/components/raster-shell";

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
    <main className="flex w-full flex-1 items-center justify-center overflow-y-auto overscroll-contain px-5 py-10 md:px-8 md:py-14">
      <SurfacePanel className="w-full max-w-[420px]" padded={false}>
        <div className="p-6 md:p-8">
          <AuthView path={path} />
        </div>
      </SurfacePanel>
    </main>
  );
}
