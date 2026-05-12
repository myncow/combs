import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/admin";
import { mapFiltersSchema } from "@/lib/schema";
import { listMaps } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = mapFiltersSchema.parse({
    topicFamily: searchParams.get("topicFamily") ?? undefined,
    status: searchParams.get("status") ?? "published",
    sort: searchParams.get("sort") ?? "recent",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "9",
    scope: searchParams.get("scope") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    visibility: searchParams.get("visibility") ?? undefined,
    owner: searchParams.get("owner") ?? undefined,
  });

  const user = await getSessionUser();
  const requestedScope =
    filters.scope ?? (user ? "mine" : "public");

  if (requestedScope === "admin") {
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const maps = await listMaps({
      topicFamily: filters.topicFamily,
      status: filters.status,
      page: filters.page,
      pageSize: filters.pageSize,
      ownerId: filters.owner,
      query: filters.q,
      visibility: filters.visibility,
    });
    return NextResponse.json(maps);
  }

  if (requestedScope === "mine") {
    if (!user) {
      return NextResponse.json({ items: [], total: 0 });
    }
    const maps = await listMaps({
      topicFamily: filters.topicFamily,
      status: filters.status,
      page: filters.page,
      pageSize: filters.pageSize,
      ownerId: user.id,
    });
    return NextResponse.json(maps);
  }

  // Default: public-only listing for the gallery / signed-out home.
  const maps = await listMaps({
    topicFamily: filters.topicFamily,
    status: filters.status,
    page: filters.page,
    pageSize: filters.pageSize,
    publicOnly: true,
  });
  return NextResponse.json(maps);
}
