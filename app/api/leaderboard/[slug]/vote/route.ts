import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";
import { checkRateLimit } from "@/lib/guards";
import { leaderboardVoteRequestSchema } from "@/lib/schema";
import { castLeaderboardVote } from "@/lib/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data: session } = await getAuth().getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimit = await checkRateLimit(`vote:${userId}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many votes. Please try again shortly." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = leaderboardVoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid vote payload." },
      { status: 400 },
    );
  }

  const entry = await castLeaderboardVote({
    slug,
    requesterId: `user:${userId}`,
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
