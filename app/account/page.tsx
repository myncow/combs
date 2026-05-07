import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedInIcon } from "@/components/auth-status-icon";
import { UserAvatar } from "@/components/user-avatar";
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-5 py-12 md:py-14">
      <header className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <SignedInIcon className="text-foreground" />
          Signed in
        </span>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">Home</Link>
        </Button>
      </header>

      <section className="flex items-center gap-4 border border-border bg-card p-5 md:p-6">
        <UserAvatar name={user.name} email={user.email} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate font-sans text-[26px] font-semibold leading-tight tracking-[-0.015em] text-foreground md:text-[30px]">
            {user.name}
          </h1>
          <p className="mt-1 truncate font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
            {user.email}
          </p>
        </div>
      </section>

      <section className="border border-border bg-background/70 p-5 md:p-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Name</dt>
            <dd className="mt-1 font-sans text-[15px] leading-[1.5] text-foreground">{user.name}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Email</dt>
            <dd className="mt-1 break-all font-sans text-[15px] leading-[1.5] text-foreground">{user.email}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <form action={signOutServer}>
          <Button type="submit" variant="outline" size="sm">
            <LogOut className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
            Sign out
          </Button>
        </form>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Maps and spotlights live in the sidebar at{" "}
          <Link href="/" className="text-foreground underline decoration-border underline-offset-4 hover:text-primary">
            home
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
