import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLeaderboardEntryBySlug } from "@/lib/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getLeaderboardEntryBySlug(slug);
  if (!entry) {
    return {};
  }
  return {
    title: `${entry.storyTitle} | Top List`,
    description: entry.storySummary,
    openGraph: {
      title: entry.storyTitle,
      description: entry.storySummary,
      images: [{ url: entry.imageUrl }],
    },
  };
}

export default async function LeaderboardEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/leaderboard?spotlight=${encodeURIComponent(slug)}`);
}
