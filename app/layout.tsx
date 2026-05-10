import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./theme.css";
import "./globals.css";
import { NeonAuthProviders } from "@/components/neon-auth-providers";
import { SiteHeader } from "@/components/site-header";
import { ThemeBootstrap } from "@/components/theme-bootstrap";
import { getSiteUrl } from "@/lib/site-url";
import { getNavigation, getSiteSettings } from "@/lib/store";
import { THEME_STORAGE_KEY, parseThemeCookie } from "@/lib/theme-preference";
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

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  return {
    metadataBase: getSiteUrl(),
    title: {
      default: settings.defaultSeoTitle,
      template: settings.metadataTitleTemplate,
    },
    description: settings.defaultSeoDescription,
    applicationName: settings.appName,
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: settings.openGraphTitle,
      description: settings.openGraphDescription,
      siteName: settings.appName,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: settings.openGraphTitle,
      description: settings.openGraphDescription,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookiePref = parseThemeCookie(cookieStore.get(THEME_STORAGE_KEY)?.value);
  const ssrDark = (cookiePref ?? "system") === "dark";
  const [settings, headerLinks] = await Promise.all([getSiteSettings(), getNavigation("header_primary")]);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn(geistSans.variable, geistMono.variable, "h-full antialiased", ssrDark && "dark")}
    >
      <body className="h-dvh overflow-hidden bg-background font-sans text-foreground">
        <ThemeBootstrap />
        <NeonAuthProviders>
          <div className="flex h-dvh flex-col overflow-hidden">
            <SiteHeader brandName={settings.appName} primaryLinks={headerLinks} />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </div>
        </NeonAuthProviders>
      </body>
    </html>
  );
}
