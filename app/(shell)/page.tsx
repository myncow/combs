import { SignedOutHome } from "@/components/signed-out-home";
import { NewMapHome } from "@/components/new-map-home";
import { auth } from "@/lib/auth/server";
import { hasDatabaseUrl } from "@/lib/db/client";
import { listLeaderboardEntries } from "@/lib/store";
import type { ListedLeaderboardEntry } from "@/lib/types";

async function loadHomeLeaderboardPreview(): Promise<ListedLeaderboardEntry[]> {
  if (!hasDatabaseUrl()) {
    return [];
  }
  try {
    const { items } = await listLeaderboardEntries({ pageSize: 4, sort: "top", page: 1 });
    return items;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const { data: session } = await auth.getSession();

  if (session?.user) {
    return <NewMapHome />;
  }

  const preview = await loadHomeLeaderboardPreview();
  const signInHref = `/auth/sign-in?redirectTo=${encodeURIComponent("/")}`;
  const signUpHref = `/auth/sign-up?redirectTo=${encodeURIComponent("/")}`;

  return (
    <SignedOutHome
      signInHref={signInHref}
      signUpHref={signUpHref}
      leaderboardHref="/leaderboard"
      preview={preview}
    />
  );
}
