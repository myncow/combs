import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./theme.css";
import "./globals.css";
import { NeonAuthProviders } from "@/components/neon-auth-providers";
import { SiteHeader } from "@/components/site-header";
import { ThemeBootstrap } from "@/components/theme-bootstrap";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getSiteUrl } from "@/lib/site-url";
import {
  THEME_STORAGE_KEY,
  parseThemeCookie,
  type ThemePreference,
} from "@/lib/theme-preference";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const SITE_DESCRIPTION =
  "Raster maps a topic across two picturable traits and marks the cells with no picture yet.";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Raster — two-axis visual maps",
    template: "%s · Raster",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Raster",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Raster — two-axis visual maps",
    description: SITE_DESCRIPTION,
    siteName: "Raster",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Raster — two-axis visual maps",
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookiePref = parseThemeCookie(cookieStore.get(THEME_STORAGE_KEY)?.value);
  const initialThemePreference: ThemePreference = cookiePref ?? "system";
  const ssrDark = initialThemePreference === "dark";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn(geistSans.variable, geistMono.variable, "h-full antialiased", ssrDark && "dark")}
    >
      <body className="min-h-dvh bg-background font-sans text-foreground md:h-dvh md:overflow-hidden">
        <ThemeBootstrap />
        <NeonAuthProviders>
          <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
            <SiteHeader />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            <ThemeSwitcher
              initialPreference={initialThemePreference}
              initialResolvedDark={ssrDark}
            />
            <SiteFooter />
          </div>
        </NeonAuthProviders>
      </body>
    </html>
  );
}

function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="shrink-0 border-t border-border md:hidden">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-4 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground md:px-8">
        <Link href="/" className="hover:text-foreground">
          Raster · two-axis visual maps
        </Link>
        <span className="tabular-nums">{year}</span>
      </div>
    </footer>
  );
}
