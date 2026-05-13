import { NextResponse } from "next/server";
import { getVoterIdentity } from "@/lib/guards";
import { leaderboardVoteRequestSchema } from "@/lib/schema";
import { castLeaderboardVote } from "@/lib/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const body = await request.json().catch(() => null);
  const parsed = leaderboardVoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid vote payload." },
      { status: 400 },
    );
  }

  const requesterId = await getVoterIdentity();
  const entry = await castLeaderboardVote({
    slug,
    requesterId,
    direction: parsed.data.direction,
  });
  if (!entry) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    score: entry.score,
    upvotes: entry.upvotes,
    downvotes: entry.downvotes,
    viewerVote: "viewerVote" in entry ? entry.viewerVote : null,
  });
}
