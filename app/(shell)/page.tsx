import { NewMapHome } from "@/components/new-map-home";
import { SignedOutHome } from "@/components/signed-out-home";
import { getSessionUser } from "@/lib/auth/admin";
import { getPageByKey, listLeaderboardEntries, listMaps } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [content, user] = await Promise.all([getPageByKey("home"), getSessionUser()]);
  if (content?.key !== "home") {
    throw new Error("Home page content is missing.");
  }
  if (!user) {
    const [maps, spotlights] = await Promise.all([
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
        signInHref="/auth/sign-in"
        signUpHref="/auth/sign-up"
        leaderboardHref="/leaderboard"
        galleryHref="/gallery"
        preview={spotlights.items}
        mapPreview={maps.items}
      />
    );
  }
  return <NewMapHome content={content} />;
}
