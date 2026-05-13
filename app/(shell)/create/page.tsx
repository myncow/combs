import { redirect } from "next/navigation";
import { NewMapHome } from "@/components/new-map-home";
import { getSessionUser } from "@/lib/auth/admin";
import { getPageByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CreateMapPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/sign-in?redirectTo=/create");
  }

  const content = await getPageByKey("home");
  return <NewMapHome content={content?.key === "home" ? content : null} />;
}
