import Link from "next/link";
import { mapFiltersSchema } from "@/lib/schema";
import { getPageByKey, listMaps } from "@/lib/store";

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = mapFiltersSchema.safeParse({
    topicFamily: typeof params.topicFamily === "string" ? params.topicFamily : undefined,
    sort: typeof params.sort === "string" ? params.sort : "recent",
    page: typeof params.page === "string" ? params.page : "1",
    pageSize: 24,
    status: "live",
  });
  const filters = parsed.success
    ? parsed.data
    : mapFiltersSchema.parse({
        topicFamily: undefined,
        sort: "recent",
        page: "1",
        pageSize: 24,
        status: "live",
      });

  const { total } = await listMaps({
    topicFamily: filters.topicFamily,
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status ?? "live",
  });
  const pageContent = await getPageByKey("gallery");
  if (pageContent?.key !== "gallery") {
    throw new Error("Gallery page content is missing.");
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overscroll-contain px-5 py-6 md:px-8 md:py-8">
      <h1 className="font-sans text-xl font-semibold tracking-tight text-foreground md:text-2xl">{pageContent.heading}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {pageContent.intro}{" "}
        {filters.topicFamily ? (
          <>
            Filter: <span className="text-foreground">{filters.topicFamily}</span>.{" "}
            <Link href="/gallery" className="underline decoration-border underline-offset-2 hover:text-foreground">
              Clear
            </Link>
          </>
        ) : null}
      </p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
        {total === 1 ? "1 map" : `${total} maps`}
      </p>
    </main>
  );
}
