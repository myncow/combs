import Link from "next/link";
import { Suspense } from "react";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { getSessionUser } from "@/lib/auth/admin";
import type { NavigationLink, SiteSettings } from "@/lib/types";
import { getNavigation, getSiteSettings, listMaps } from "@/lib/store";

export const dynamic = "force-dynamic";

async function ExplorerSidebarLoader() {
  const user = await getSessionUser();
  if (!user) {
    // The rail is still rendered for signed-out visitors so the layout
    // stays consistent across auth states; it just shows a sign-in CTA
    // instead of the personal map list.
    return <ExplorerSidebar isSignedIn={false} />;
  }
  const mapsResult = await listMaps({
    pageSize: 48,
    status: "library",
    page: 1,
    ownerId: user.id,
  });

  return (
    <ExplorerSidebar
      isSignedIn
      initialMaps={{ items: mapsResult.items, total: mapsResult.total }}
    />
  );
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const [footerSettings, footerLinks] = await Promise.all([
    getSiteSettings(),
    getNavigation("footer_primary"),
  ]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="order-2 flex md:order-1 md:min-h-0">
          <Suspense
            fallback={
              <aside className="hidden w-12 shrink-0 border-r border-border md:block md:h-full" />
            }
          >
            <ExplorerSidebarLoader />
          </Suspense>
        </div>
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">{children}</div>
      </div>
      <ShellFooter settings={footerSettings} links={footerLinks} />
    </>
  );
}

function ShellFooter({
  settings,
  links,
}: {
  settings: SiteSettings;
  links: NavigationLink[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="shrink-0 border-t border-border md:hidden">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-4 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="hover:text-foreground">
            {settings.footerCopy}
          </Link>
          {links.map((link) => (
            <Link key={link.id} href={link.href} className="hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </div>
        <span className="tabular-nums">{year}</span>
      </div>
    </footer>
  );
}
