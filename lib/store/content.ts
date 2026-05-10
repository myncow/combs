import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  homePageRevisionsTable,
  listingPageRevisionsTable,
  navigationLinksTable,
  pageRevisionsTable,
  pagesTable,
  siteSettingsTable,
} from "@/lib/db/schema";
import {
  SEEDED_GALLERY_PAGE,
  SEEDED_HOME_PAGE,
  SEEDED_LEADERBOARD_PAGE,
  SEEDED_SITE_SETTINGS,
} from "@/lib/editorial-seed";
import type { HomePageContent, ListingPageContent, NavigationLink, NavigationLocation, PageContent, SiteSettings } from "@/lib/types";

function iso(value: unknown, fallback = new Date().toISOString()) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value ? value : fallback;
}

async function ensurePageSeed(
  tx: any,
  page: HomePageContent | ListingPageContent,
  template: "home" | "listing",
) {
  const existing = await tx.select().from(pagesTable).where(eq(pagesTable.key, page.key)).limit(1);
  if (existing.length) {
    return existing[0]!;
  }

  const pageId = `page_${crypto.randomUUID()}`;
  const revisionId = `page_rev_${crypto.randomUUID()}`;
  const now = new Date();

  await tx.insert(pagesTable).values({
    id: pageId,
    key: page.key,
    slug: page.slug,
    template,
    status: "published",
    currentDraftRevisionId: revisionId,
    currentPublishedRevisionId: revisionId,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  });

  await tx.insert(pageRevisionsTable).values({
    id: revisionId,
    pageId,
    revision: 1,
    title: page.title,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    createdAt: now,
    publishedAt: now,
  });

  if (template === "home") {
    const home = page as HomePageContent;
    await tx.insert(homePageRevisionsTable).values({
      pageRevisionId: revisionId,
      heroTitle: home.heroTitle,
      heroBody: home.heroBody,
      primaryCtaLabel: home.primaryCtaLabel,
      primaryCtaHref: home.primaryCtaHref,
      sectionEyebrow: home.sectionEyebrow,
      sectionTitle: home.sectionTitle,
      sectionSummary: home.sectionSummary,
    });
  } else {
    const listing = page as ListingPageContent;
    await tx.insert(listingPageRevisionsTable).values({
      pageRevisionId: revisionId,
      heading: listing.heading,
      intro: listing.intro,
      helperText: listing.helperText,
      emptyStateTitle: listing.emptyStateTitle,
      emptyStateBody: listing.emptyStateBody,
    });
  }
}

export async function ensureEditorialContentSeeded() {
  const db = getDb();
  await db.transaction(async (tx) => {
    const siteSettings = await tx.select({ id: siteSettingsTable.id }).from(siteSettingsTable).limit(1);
    if (!siteSettings.length) {
      await tx.insert(siteSettingsTable).values({
        id: SEEDED_SITE_SETTINGS.id,
        appName: SEEDED_SITE_SETTINGS.appName,
        defaultSeoTitle: SEEDED_SITE_SETTINGS.defaultSeoTitle,
        defaultSeoDescription: SEEDED_SITE_SETTINGS.defaultSeoDescription,
        metadataTitleTemplate: SEEDED_SITE_SETTINGS.metadataTitleTemplate,
        openGraphTitle: SEEDED_SITE_SETTINGS.openGraphTitle,
        openGraphDescription: SEEDED_SITE_SETTINGS.openGraphDescription,
        footerCopy: SEEDED_SITE_SETTINGS.footerCopy,
        supportEmail: SEEDED_SITE_SETTINGS.supportEmail,
        contactUrl: SEEDED_SITE_SETTINGS.contactUrl,
        updatedAt: new Date(),
        publishedAt: null,
      });
    }

    const navLinks = await tx.select({ id: navigationLinksTable.id }).from(navigationLinksTable).limit(1);
    if (!navLinks.length) {
      await tx.insert(navigationLinksTable).values([
        {
          id: "nav_header_top_list",
          location: "header_primary",
          label: "Top list",
          href: "/leaderboard",
          sortOrder: 1,
          isEnabled: true,
        },
        {
          id: "nav_footer_home",
          location: "footer_primary",
          label: "Home",
          href: "/",
          sortOrder: 1,
          isEnabled: true,
        },
        {
          id: "nav_footer_maps",
          location: "footer_primary",
          label: "Maps",
          href: "/gallery",
          sortOrder: 2,
          isEnabled: true,
        },
        {
          id: "nav_footer_top_list",
          location: "footer_primary",
          label: "Top list",
          href: "/leaderboard",
          sortOrder: 3,
          isEnabled: true,
        },
      ]);
    }

    await ensurePageSeed(tx, SEEDED_HOME_PAGE, "home");
    await ensurePageSeed(tx, SEEDED_GALLERY_PAGE, "listing");
    await ensurePageSeed(tx, SEEDED_LEADERBOARD_PAGE, "listing");
  });
}

export async function getSiteSettings(): Promise<SiteSettings> {
  await ensureEditorialContentSeeded();
  const db = getDb();
  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, SEEDED_SITE_SETTINGS.id)).limit(1);
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
  await ensureEditorialContentSeeded();
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
  await ensureEditorialContentSeeded();
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
