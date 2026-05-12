import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveMapShell } from "@/components/live-map-shell";
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

  const isLive = map.status === "generating" || map.status === "failed";

  return (
    <ShellPage size="full" className="pb-8 md:overflow-hidden md:pb-0 md:px-6 xl:px-8">
      {isLive ? (
        <LiveMapShell initial={map} slug={slug} canMutateMap={canMutate} />
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
                viewerLabel={isAdmin && map.createdByNeonUserId !== user?.id ? "Admin override" : undefined}
              />
            ) : null}
          </div>
          <div className="flex-1 min-h-0 flex flex-col pb-3 md:pb-2">
            <MapRenderer document={map.document} canMutateMap={canMutate} />
          </div>
        </>
      )}
    </ShellPage>
  );
}
