import { NextResponse } from "next/server";
import { listLeaderboardComments } from "@/lib/store";

/**
 * GET comments for a leaderboard entry. Public — same readability as
 * the entry itself.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const comments = await listLeaderboardComments(slug);
  return NextResponse.json({ items: comments });
}
