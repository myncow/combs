import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveMapShell } from "@/components/live-map-shell";
import { isMapEnriching } from "@/components/map-card";
import { MapRenderer } from "@/components/map-renderer";
import { ShellPage } from "@/components/raster-shell";
import { MapVisibilityControl } from "@/components/map-visibility-control";
import { getSessionUser } from "@/lib/auth/admin";
import { viewerCanMutateMap, viewerCanReadMap } from "@/lib/auth/permissions";
import { getMapBySlug } from "@/lib/store";
import { simplifyMapDisplayTitle } from "@/lib/utils";

function displayTitle(title: string, topicFamily: string) {
  return simplifyMapDisplayTitle(title, topicFamily);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const map = await getMapBySlug(slug);

  if (!map) {
    return {};
  }

  return {
    title: displayTitle(map.document.seo.title || map.title, map.topicFamily),
    description: map.document.seo.description ?? "",
  };
}

export default async function MapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const map = await getMapBySlug(slug);

  if (!map) {
    notFound();
  }

  const user = await getSessionUser();
  const isAdmin = Boolean(user?.isAdmin);
  const canMutate = viewerCanMutateMap(map, user);
  if (!viewerCanReadMap(map, user)) {
    notFound();
  }

  // Route through `LiveMapShell` whenever the page might still be receiving
  // server-driven updates: generation in flight, recently failed, OR within
  // the SerpAPI enrichment window after publish (the SSE endpoint keeps
  // streaming for ~200s after publish to land reference images / anchors).
  const isLive =
    map.status === "generating" || map.status === "failed" || isMapEnriching(map);
  const adminOverrideLabel =
    isAdmin && map.createdByNeonUserId !== user?.id ? "Admin override" : undefined;

  return (
    <ShellPage size="full" className="pb-8 md:overflow-hidden md:pb-0 md:px-6 xl:px-8">
      {isLive ? (
        <LiveMapShell
          initial={map}
          slug={slug}
          canMutateMap={canMutate}
          viewerLabel={adminOverrideLabel}
        />
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 py-3 lg:py-2">
            <h1 className="font-sans text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-[36px] lg:text-[26px]">
              {displayTitle(map.title, map.topicFamily)}
            </h1>
            {canMutate ? (
              <MapVisibilityControl
                slug={map.slug}
                initialIsPublic={Boolean(map.isPublic)}
                canMutate={canMutate}
                viewerLabel={adminOverrideLabel}
              />
            ) : null}
          </div>
          <div className="flex-1 min-h-0 flex flex-col pb-3 md:pb-2">
            <MapRenderer
              document={map.document}
              canMutateMap={canMutate}
              mapIsPublic={Boolean(map.isPublic)}
            />
          </div>
        </>
      )}
    </ShellPage>
  );
}
