import { AccountView } from "@neondatabase/auth/react";
import { accountViewPaths } from "@neondatabase/auth/react/ui/server";
import { ShellPage, SurfacePanel } from "@/components/raster-shell";

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
    <ShellPage size="content">
      <SurfacePanel padded={false}>
        <div className="p-6 md:p-8">
          <AccountView path={path} />
        </div>
      </SurfacePanel>
    </ShellPage>
  );
}
