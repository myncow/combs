import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deleteMapBySlug, getMapBySlug } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);

  if (!map) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(map);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const deletedMap = await deleteMapBySlug(slug);

  if (!deletedMap) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  revalidatePath("/");
  revalidatePath("/gallery");
  revalidatePath(`/maps/${slug}`);
  revalidatePath("/api/maps");

  return NextResponse.json({ deleted: true, slug });
}
