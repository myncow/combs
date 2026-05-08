import { AccountView } from "@neondatabase/auth/react";
import { accountViewPaths } from "@neondatabase/auth/react/ui/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(accountViewPaths).map((path) => ({ path }));
}

export default async function AccountPathPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;

  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-10 md:px-8 md:py-12">
      <div className="border border-border bg-card p-6 md:p-8">
        <AccountView path={path} />
      </div>
    </main>
  );
}
