import { cache } from "react";
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

function contentFallback(key: "home" | "gallery" | "leaderboard"): PageContent {
  if (key === "home") return SEEDED_HOME_PAGE;
  if (key === "gallery") return SEEDED_GALLERY_PAGE;
  return SEEDED_LEADERBOARD_PAGE;
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

/**
 * Process-level memo so the seed transaction runs at most once per Node
 * process. Editorial content is effectively static, so once the rows
 * exist we don't need the per-render SELECT … LIMIT 1 probes. Cleared
 * via `__resetEditorialSeedMemoForTests()` when tests truncate.
 */
let seedMemo: Promise<void> | null = null;

export function __resetEditorialSeedMemoForTests(): void {
  seedMemo = null;
}

export async function ensureEditorialContentSeeded(): Promise<void> {
  if (seedMemo) return seedMemo;
  seedMemo = runEditorialSeed().catch((error) => {
    // Don't poison the memo on transient failures; let the next caller retry.
    seedMemo = null;
    throw error;
  });
  return seedMemo;
}

async function runEditorialSeed() {
  const db = getDb();
  await db.transaction(async (tx) => {
    // site_settings has no admin UI; upsert so brand changes in the seed propagate without manual DB intervention.
    const seedValues = {
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
      publishedAt: null as Date | null,
    };
    await tx
      .insert(siteSettingsTable)
      .values(seedValues)
      .onConflictDoUpdate({
        target: siteSettingsTable.id,
        set: {
          appName: seedValues.appName,
          defaultSeoTitle: seedValues.defaultSeoTitle,
          defaultSeoDescription: seedValues.defaultSeoDescription,
          metadataTitleTemplate: seedValues.metadataTitleTemplate,
          openGraphTitle: seedValues.openGraphTitle,
          openGraphDescription: seedValues.openGraphDescription,
          footerCopy: seedValues.footerCopy,
          updatedAt: seedValues.updatedAt,
        },
      });

    const navLinks = await tx.select({ id: navigationLinksTable.id }).from(navigationLinksTable).limit(1);
    if (!navLinks.length) {
      await tx.insert(navigationLinksTable).values([
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
          href: "/maps",
          sortOrder: 2,
          isEnabled: true,
        },
      ]);
    }

    await ensurePageSeed(tx, SEEDED_HOME_PAGE, "home");
    await ensurePageSeed(tx, SEEDED_GALLERY_PAGE, "listing");
    await ensurePageSeed(tx, SEEDED_LEADERBOARD_PAGE, "listing");
  });
}

export const getSiteSettings = cache(_getSiteSettings);

async function _getSiteSettings(): Promise<SiteSettings> {
  try {
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
  } catch (error) {
    console.error("[content:getSiteSettings] fallback", error);
    return SEEDED_SITE_SETTINGS;
  }
}

export const getNavigation = cache(_getNavigation);

async function _getNavigation(location: NavigationLocation): Promise<NavigationLink[]> {
  try {
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
  } catch (error) {
    console.error("[content:getNavigation] fallback", error);
    if (location === "footer_primary") {
      return [
        {
          id: "nav_footer_home",
          location,
          label: "Home",
          href: "/",
          sortOrder: 1,
          isEnabled: true,
        },
        {
          id: "nav_footer_maps",
          location,
          label: "Maps",
          href: "/maps",
          sortOrder: 2,
          isEnabled: true,
        },
      ];
    }
    return [];
  }
}

export const getPageByKey = cache(_getPageByKey);

async function _getPageByKey(key: "home" | "gallery" | "leaderboard"): Promise<PageContent | null> {
  try {
    await ensureEditorialContentSeeded();
    const db = getDb();
    const pages = await db.select().from(pagesTable).where(eq(pagesTable.key, key)).limit(1);
    const page = pages[0];
    if (!page || !page.currentPublishedRevisionId) return contentFallback(key);

    const revisions = await db
      .select()
      .from(pageRevisionsTable)
      .where(eq(pageRevisionsTable.id, page.currentPublishedRevisionId))
      .limit(1);
    const revision = revisions[0];
    if (!revision) return contentFallback(key);

    if (page.template === "home") {
      const rows = await db
        .select()
        .from(homePageRevisionsTable)
        .where(eq(homePageRevisionsTable.pageRevisionId, revision.id))
        .limit(1);
      const content = rows[0];
      if (!content) return contentFallback(key);
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
    if (!content) return contentFallback(key);

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
  } catch (error) {
    console.error("[content:getPageByKey] fallback", error);
    return contentFallback(key);
  }
}
