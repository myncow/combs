import { NextResponse } from "next/server";
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
  });

  const maps = await listMaps({
    topicFamily: filters.topicFamily,
    status: filters.status,
    page: filters.page,
    pageSize: filters.pageSize,
  });
  return NextResponse.json(maps);
}
