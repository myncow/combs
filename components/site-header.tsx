"use client";

import { HeaderAuth } from "@/components/header-auth";
import { SettingsMenu } from "@/components/settings-menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { MouseEvent } from "react";
import type { NavigationLink } from "@/lib/types";
import { cn } from "@/lib/utils";

function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x="1" y="1" width="6" height="6" fill="currentColor" />
      <rect x="9" y="1" width="6" height="6" fill="currentColor" />
      <rect x="17" y="1" width="6" height="6" fill="currentColor" />
      <rect x="1" y="9" width="6" height="6" fill="currentColor" />
      <rect x="9" y="9" width="6" height="6" fill="currentColor" />
      <rect x="17" y="9" width="6" height="6" fill="currentColor" />
      <rect x="1" y="17" width="6" height="6" fill="currentColor" />
      <rect x="9" y="17" width="6" height="6" fill="currentColor" />
      <rect x="17" y="17" width="6" height="6" fill="var(--primary)" />
    </svg>
  );
}

export function SiteHeader({
  brandName = "Raster",
  primaryLinks = [],
  isAdmin = false,
}: {
  brandName?: string;
  primaryLinks?: NavigationLink[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    const alreadyCleanHome =
      pathname === "/" &&
      window.location.search === "" &&
      window.location.hash === "";

    if (alreadyCleanHome) {
      router.refresh();
      return;
    }
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-[color:color-mix(in_srgb,var(--background)_92%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1240px] items-center gap-5 px-5 py-2 md:px-8">
        <Link
          href="/"
          aria-label={`${brandName} — home`}
          onClick={handleHomeClick}
          className="flex shrink-0 items-center gap-2.5 rounded-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <LogoMark className="text-foreground" />
          <span className="font-sans text-[15px] font-semibold uppercase leading-none tracking-[0.08em]">
            {brandName}
          </span>
        </Link>
        <nav aria-label="Primary" className="flex items-center">
          {primaryLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(link.href) ?? false;
            return (
              <Link
                key={link.id}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link
            href="/create"
            aria-label="New map"
            title="New map"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus className="h-4 w-4" aria-hidden strokeWidth={2} />
          </Link>
          <SettingsMenu isAdmin={isAdmin} />
          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}
