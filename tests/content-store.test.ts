import { isLeaderboardStoreTestDbConfigured } from "./ensure-db-url-for-store-tests";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbClientForTests } from "@/lib/db/client";
import { getNavigation, getPageByKey, getSiteSettings } from "@/lib/store";

async function truncateContentTables() {
  const db = getDb();
  await db.execute(
    sql.raw(
      "TRUNCATE home_page_revisions, listing_page_revisions, page_revisions, pages, navigation_links, site_settings RESTART IDENTITY CASCADE",
    ),
  );
}

describe.skipIf(!isLeaderboardStoreTestDbConfigured)("content store", () => {
  afterAll(async () => {
    await resetDbClientForTests();
  });

  beforeEach(async () => {
    await truncateContentTables();
  });

  it("seeds and reads site settings, navigation, and page content", async () => {
    const [settings, headerLinks, homePage, galleryPage, leaderboardPage] = await Promise.all([
      getSiteSettings(),
      getNavigation("header_primary"),
      getPageByKey("home"),
      getPageByKey("gallery"),
      getPageByKey("leaderboard"),
    ]);

    expect(settings.appName).toBe("Raster");
    expect(headerLinks[0]?.href).toBe("/leaderboard");
    expect(homePage?.key).toBe("home");
    expect(homePage && homePage.key === "home" ? homePage.heroTitle : null).toBe("New map");
    expect(galleryPage?.key).toBe("gallery");
    expect(galleryPage && galleryPage.key === "gallery" ? galleryPage.heading : null).toBe("Maps");
    expect(leaderboardPage?.key).toBe("leaderboard");
    expect(leaderboardPage && leaderboardPage.key === "leaderboard" ? leaderboardPage.heading : null).toBe(
      "Top list",
    );
  });
});
