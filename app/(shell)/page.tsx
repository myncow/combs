import { SignedOutHome } from "@/components/signed-out-home";
import { getSessionUser } from "@/lib/auth/admin";
import { listLeaderboardEntries, listMaps } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, maps, spotlights] = await Promise.all([
    getSessionUser(),
    listMaps({
      pageSize: 12,
      page: 1,
      status: "live",
      publicOnly: true,
    }),
    listLeaderboardEntries({
      sort: "top",
      page: 1,
      pageSize: 6,
    }),
  ]);

  return (
    <SignedOutHome
      isSignedIn={Boolean(user)}
      signInHref="/auth/sign-in"
      signUpHref="/auth/sign-up"
      leaderboardHref="/leaderboard"
      galleryHref="/gallery"
      preview={spotlights.items}
      mapPreview={maps.items}
    />
  );
}
