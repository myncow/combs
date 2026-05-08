import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AccountIndexPage() {
  const { data: session } = await getAuth().getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  redirect("/account/settings");
}
