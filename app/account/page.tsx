import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/server";

import { signOutServer } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const user = session.user;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-5 py-14">
      <div>
        <h1 className="font-sans text-[32px] font-semibold tracking-[-0.015em] text-foreground">
          Account
        </h1>
        <dl className="mt-8 flex flex-col gap-4 font-sans text-[15px] leading-[1.55]">
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Name</dt>
            <dd className="mt-1 text-foreground">{user.name}</dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Email</dt>
            <dd className="mt-1 text-foreground">{user.email}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form action={signOutServer}>
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
