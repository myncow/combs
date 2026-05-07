import type { ListedLeaderboardEntry } from "@/lib/types";

export function makeListedLeaderboardEntry(overrides: Partial<ListedLeaderboardEntry> = {}): ListedLeaderboardEntry {
  const i = Math.floor(Math.random() * 1e9);
  return {
    id: `id-${i}`,
    slug: `slug-${i}`,
    mapId: `map-${i}`,
    mapSlug: `map-slug-${i}`,
    mapTitle: "Map title",
    topicFamily: "Topic",
    cellId: `cell-${i}`,
    cellLabel: "Cell",
    coordinatesSnapshot: { primary: "a", secondary: "b" },
    imageUrl: "https://example.com/image.jpg",
    storyTitle: "Story title",
    storySummary: "Summary text",
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    score: 3,
    upvotes: 2,
    downvotes: 1,
    ...overrides,
  };
}
