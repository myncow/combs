import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy /gallery route. The maps list now lives at /maps; forward any
 * incoming traffic (shared links, sitemap caches) while preserving
 * filters.
 */
export default async function GalleryRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length) {
      next.set(key, value);
    } else if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === "string" && v.length);
      if (first) next.set(key, first);
    }
  }
  const qs = next.toString();
  redirect(qs ? `/maps?${qs}` : "/maps");
}
