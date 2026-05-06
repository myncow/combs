import { NextResponse } from "next/server";
import { getRequesterId } from "@/lib/guards";
import { getLeaderboardEntryBySlug } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const requesterId = await getRequesterId();
  const entry = await getLeaderboardEntryBySlug(slug, requesterId);
  if (!entry) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ item: entry });
}
