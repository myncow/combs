import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getRequesterId, moderateText } from "@/lib/guards";
import { leaderboardFiltersSchema, publishGapSpotlightSchema } from "@/lib/schema";
import { listLeaderboardEntries, publishGapSpotlight } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = leaderboardFiltersSchema.parse({
    topicFamily: searchParams.get("topicFamily") ?? undefined,
    sort: searchParams.get("sort") ?? "top",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "12",
  });
  const requesterId = await getRequesterId();
  const entries = await listLeaderboardEntries({
    topicFamily: filters.topicFamily,
    sort: filters.sort,
    page: filters.page,
    pageSize: filters.pageSize,
    requesterId,
  });
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = publishGapSpotlightSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid publish payload." },
      { status: 400 },
    );
  }

  const moderated = moderateText(`${parsed.data.storyTitle} ${parsed.data.storySummary}`);
  if (!moderated.safe) {
    return NextResponse.json(
      { error: moderated.reason ?? "This publish request is blocked by moderation." },
      { status: 400 },
    );
  }

  try {
    const entry = await publishGapSpotlight(parsed.data);
    revalidatePath("/leaderboard");
    revalidatePath(`/leaderboard/${entry.slug}`);
    revalidatePath("/api/leaderboard");
    return NextResponse.json({ item: entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not publish spotlight." },
      { status: 400 },
    );
  }
}
