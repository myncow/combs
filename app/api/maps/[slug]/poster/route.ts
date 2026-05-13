import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/admin";
import { viewerCanMutateMap, viewerCanReadMap } from "@/lib/auth/permissions";
import { generateMapPoster } from "@/lib/poster-image";
import { materializeMapPoster } from "@/lib/map-poster-storage";
import { getMapBySlug, setMapPoster } from "@/lib/store";

/**
 * GET — return the current poster URL (read access required).
 * POST — regenerate the poster, persist to Blob, and update the map row
 *   (write access required). Returns the new URL + timestamp.
 *
 * Why not a server action? Poster generation can take 30–90s and the
 * dialog wants to surface explicit errors / a "retry" affordance.
 * Routing the call through a route handler keeps the request lifecycle
 * obvious and lets us keep the client component pure-fetch.
 */
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
  if (!viewerCanReadMap(map, user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    posterUrl: map.posterUrl ?? null,
    posterGeneratedAt: map.posterGeneratedAt ?? null,
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);
  if (!map) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await getSessionUser();
  if (!viewerCanMutateMap(map, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (map.status !== "published") {
    return NextResponse.json(
      { error: "Poster generation is only available once the map has finished generating." },
      { status: 400 },
    );
  }

  try {
    const generated = await generateMapPoster(map.document);
    const materialized = await materializeMapPoster(slug, generated.imageUrl);
    const persisted = await setMapPoster(slug, materialized.url, user!.id);
    if (!persisted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    revalidatePath(`/maps/${slug}`);
    return NextResponse.json({
      posterUrl: persisted.posterUrl,
      posterGeneratedAt: persisted.posterGeneratedAt,
      model: generated.model,
      anchorCount: generated.anchorCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Poster generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// Poster generation can run up to ~90s on busy upstream image providers.
// Vercel's default fluid-compute timeout (300s) covers this, but pin the
// hint explicitly so reviewers see the intent.
export const maxDuration = 300;
