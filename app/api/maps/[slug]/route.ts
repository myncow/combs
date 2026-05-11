import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/admin";
import { deleteMapBySlug, getMapBySlug, setMapPublicState } from "@/lib/store";

function viewerCanRead(
  map: { isPublic?: boolean; createdByNeonUserId?: string | null },
  user: { id: string; isAdmin: boolean } | null,
) {
  if (map.isPublic) return true;
  if (!user) return false;
  if (user.isAdmin) return true;
  return map.createdByNeonUserId === user.id;
}

function viewerCanMutate(
  map: { createdByNeonUserId?: string | null },
  user: { id: string; isAdmin: boolean } | null,
) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return map.createdByNeonUserId === user.id;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);

  if (!map) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!viewerCanRead(map, user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(map);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);
  if (!map) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getSessionUser();
  if (!viewerCanMutate(map, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as
    | { isPublic?: unknown }
    | null;
  if (!payload || typeof payload.isPublic !== "boolean") {
    return NextResponse.json(
      { error: "isPublic (boolean) is required." },
      { status: 400 },
    );
  }

  const updated = await setMapPublicState(slug, payload.isPublic, user!.id);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  revalidatePath(`/maps/${slug}`);
  revalidatePath("/gallery");
  revalidatePath("/admin/maps");
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);
  if (!map) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getSessionUser();
  if (!viewerCanMutate(map, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deletedMap = await deleteMapBySlug(slug);
  if (!deletedMap) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  revalidatePath("/");
  revalidatePath("/gallery");
  revalidatePath(`/maps/${slug}`);
  revalidatePath("/api/maps");
  revalidatePath("/admin/maps");

  return NextResponse.json({ deleted: true, slug });
}
