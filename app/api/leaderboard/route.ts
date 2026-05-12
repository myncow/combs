import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/auth/admin";
import { viewerCanMutateMap } from "@/lib/auth/permissions";
import { getAuth } from "@/lib/auth/server";
import { getRequesterId, moderateText } from "@/lib/guards";
import { leaderboardFiltersSchema, publishGapSpotlightSchema } from "@/lib/schema";
import { getMapBySlug, listLeaderboardEntries, publishGapSpotlight } from "@/lib/store";

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
  const { data: session } = await getAuth().getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in to publish to the top list." }, { status: 401 });
  }

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
    const sessionUser = session.user as { id?: string | null; email?: string | null };
    const map = await getMapBySlug(parsed.data.mapSlug);
    const viewer = sessionUser.id
      ? { id: sessionUser.id, isAdmin: isAdminEmail(sessionUser.email) }
      : null;
    if (!map || !viewerCanMutateMap(map, viewer)) {
      return NextResponse.json(
        { error: "Only the map owner or an admin can publish this spotlight." },
        { status: 403 },
      );
    }
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
