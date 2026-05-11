import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveMapShell } from "@/components/live-map-shell";
import { MapRenderer } from "@/components/map-renderer";
import { PageHeader, ShellPage } from "@/components/raster-shell";
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

  const isLive = map.status === "generating" || map.status === "failed";

  return (
    <ShellPage size="full" className="pb-8 md:overflow-hidden md:pb-0 md:px-6 xl:px-8">
      {isLive ? (
        <LiveMapShell initial={map} slug={slug} />
      ) : (
        <>
          <PageHeader
            index="03"
            eyebrow={map.topicFamily}
            title={displayTitle(map.title, map.topicFamily)}
            intro={map.summary}
            summary={map.document.domain}
            className="shrink-0"
            titleClassName="text-[28px] sm:text-[36px] lg:text-[30px]"
            introClassName="max-w-[44rem]"
          />
          <div className="flex-1 min-h-0 flex flex-col pt-5 md:pt-6 md:pb-2">
            <MapRenderer document={map.document} />
          </div>
        </>
      )}
    </ShellPage>
  );
}
