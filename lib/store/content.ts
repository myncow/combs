import { asc, eq } from "drizzle-orm";
import {
  homePageRevisionsTable,
  listingPageRevisionsTable,
  navigationLinksTable,
  pageRevisionsTable,
  pagesTable,
  siteSettingsTable,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import type { NavigationLink, NavigationLocation, PageContent, SiteSettings } from "@/lib/types";

function iso(value: unknown, fallback = new Date().toISOString()) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value ? value : fallback;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const db = getDb();
  const rows = await db.select().from(siteSettingsTable).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("site_settings is empty.");
  }

  return {
    id: row.id,
    appName: row.appName,
    defaultSeoTitle: row.defaultSeoTitle,
    defaultSeoDescription: row.defaultSeoDescription,
    metadataTitleTemplate: row.metadataTitleTemplate,
    openGraphTitle: row.openGraphTitle,
    openGraphDescription: row.openGraphDescription,
    footerCopy: row.footerCopy,
    supportEmail: row.supportEmail,
    contactUrl: row.contactUrl,
    updatedAt: iso(row.updatedAt),
    publishedAt: row.publishedAt ? iso(row.publishedAt) : null,
  };
}

export async function getNavigation(location: NavigationLocation): Promise<NavigationLink[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(navigationLinksTable)
    .where(eq(navigationLinksTable.location, location))
    .orderBy(asc(navigationLinksTable.sortOrder));

  return rows.map((row) => ({
    id: row.id,
    location: row.location,
    label: row.label,
    href: row.href,
    sortOrder: row.sortOrder,
    isEnabled: row.isEnabled,
  }));
}

export async function getPageByKey(key: "home" | "gallery" | "leaderboard"): Promise<PageContent | null> {
  const db = getDb();
  const pages = await db.select().from(pagesTable).where(eq(pagesTable.key, key)).limit(1);
  const page = pages[0];
  if (!page || !page.currentPublishedRevisionId) return null;

  const revisions = await db
    .select()
    .from(pageRevisionsTable)
    .where(eq(pageRevisionsTable.id, page.currentPublishedRevisionId))
    .limit(1);
  const revision = revisions[0];
  if (!revision) return null;

  if (page.template === "home") {
    const rows = await db
      .select()
      .from(homePageRevisionsTable)
      .where(eq(homePageRevisionsTable.pageRevisionId, revision.id))
      .limit(1);
    const content = rows[0];
    if (!content) return null;
    return {
      key: "home",
      slug: page.slug,
      title: revision.title,
      seoTitle: revision.seoTitle,
      seoDescription: revision.seoDescription,
      heroTitle: content.heroTitle,
      heroBody: content.heroBody,
      primaryCtaLabel: content.primaryCtaLabel,
      primaryCtaHref: content.primaryCtaHref,
      sectionEyebrow: content.sectionEyebrow,
      sectionTitle: content.sectionTitle,
      sectionSummary: content.sectionSummary,
    };
  }

  const rows = await db
    .select()
    .from(listingPageRevisionsTable)
    .where(eq(listingPageRevisionsTable.pageRevisionId, revision.id))
    .limit(1);
  const content = rows[0];
  if (!content) return null;

  return {
    key: key as "gallery" | "leaderboard",
    slug: page.slug,
    title: revision.title,
    seoTitle: revision.seoTitle,
    seoDescription: revision.seoDescription,
    heading: content.heading,
    intro: content.intro,
    helperText: content.helperText,
    emptyStateTitle: content.emptyStateTitle,
    emptyStateBody: content.emptyStateBody,
  };
}
