"use client";

import { HeaderAuth } from "@/components/header-auth";
import { SettingsMenu } from "@/components/settings-menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Flame, LayoutGrid } from "lucide-react";
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
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-[color:color-mix(in_srgb,var(--background)_92%,transparent)] backdrop-blur-md">
      {/* Left-aligned with consistent px-5 / md:px-8 so the brand sits at
          the same x-offset as every ShellPage body below. Do NOT add
          `mx-auto max-w-*` here — that would re-introduce the indentation
          mismatch with the page body in signed-out mode. */}
      <div className="flex items-center gap-5 px-5 py-2 md:px-8">
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
            href="/"
            aria-label="Leaderboard"
            title="Leaderboard"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              pathname === "/" && "border-foreground/40 text-foreground",
            )}
          >
            <Flame className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          </Link>
          <Link
            href="/gallery"
            aria-label="Maps"
            title="Maps"
            aria-current={pathname?.startsWith("/gallery") ? "page" : undefined}
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              pathname?.startsWith("/gallery") && "border-foreground/40 text-foreground",
            )}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          </Link>
          <SettingsMenu isAdmin={isAdmin} />
          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}
