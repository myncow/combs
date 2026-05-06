import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site-url";
import { listLeaderboardEntries, listMaps } from "@/lib/store";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteOrigin();
  const [maps, leaderboard] = await Promise.all([
    listMaps({ pageSize: 100 }),
    listLeaderboardEntries({ pageSize: 100, sort: "new" }),
  ]);

  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
    },
    {
      url: `${base}/gallery`,
      lastModified: new Date(),
    },
    {
      url: `${base}/leaderboard`,
      lastModified: new Date(),
    },
    ...maps.items.map((map) => ({
      url: `${base}/maps/${map.slug}`,
      lastModified: map.publishedAt ?? map.createdAt,
    })),
    ...leaderboard.items.map((entry) => ({
      url: `${base}/leaderboard/${entry.slug}`,
      lastModified: entry.publishedAt,
    })),
  ];
}
