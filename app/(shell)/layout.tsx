import Link from "next/link";
import { Suspense } from "react";
import { ExplorerSidebar } from "@/components/explorer-sidebar";
import { DEFAULT_SITE_SETTINGS } from "@/lib/content-defaults";
import { getAuth } from "@/lib/auth/server";
import { hasDatabaseUrl } from "@/lib/db/client";
import type { NavigationLink, SavedMap, SiteSettings } from "@/lib/types";
import { getNavigation, getSiteSettings, listMaps } from "@/lib/store";

export const dynamic = "force-dynamic";

async function ExplorerSidebarLoader() {
  const { data: session } = await getAuth().getSession();
  const isSignedIn = Boolean(session?.user);

  let mapsResult: { items: SavedMap[]; total: number } = { items: [], total: 0 };
  let hydrationError: string | undefined;

  if (hasDatabaseUrl()) {
    try {
      mapsResult = await listMaps({ pageSize: 48, status: "library", page: 1 });
    } catch (err) {
      hydrationError =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Could not load maps from the database.";
      console.error("ExplorerSidebarLoader failed:", err);
    }
  }

  return (
    <ExplorerSidebar
      isSignedIn={isSignedIn}
      initialMaps={{ items: mapsResult.items, total: mapsResult.total }}
      initialHydrationError={hydrationError}
    />
  );
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const footerData: { settings: SiteSettings; links: NavigationLink[] } = hasDatabaseUrl()
    ? await Promise.all([getSiteSettings(), getNavigation("footer_primary")]).then(([settings, links]) => ({
        settings,
        links,
      }))
    : { settings: DEFAULT_SITE_SETTINGS, links: [] };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="order-2 md:order-1">
          <Suspense
            fallback={<aside className="hidden w-[min(320px,30vw)] shrink-0 border-r border-border md:block" />}
          >
            <ExplorerSidebarLoader />
          </Suspense>
        </div>
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">{children}</div>
      </div>
      <ShellFooter settings={footerData.settings} links={footerData.links} />
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
