import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy leaderboard route. The landing page is now the leaderboard
 * itself, so this just forwards visitors (and any shared links) to `/`
 * while preserving every query param. The `/leaderboard/[slug]` detail
 * route still works on its own.
 */
export default async function LeaderboardRedirect({
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
  redirect(qs ? `/?${qs}` : "/");
}
