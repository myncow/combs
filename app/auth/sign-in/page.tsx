"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-5 py-14">
      <div>
        <h1 className="font-sans text-[32px] font-semibold tracking-[-0.015em] text-foreground">
          Sign in
        </h1>
        <p className="mt-2 font-sans text-[15px] leading-[1.55] text-muted-foreground">
          Use the email and password for your Raster account.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Email
          </label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {state?.error ? (
          <p className="font-sans text-[14px] text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="font-sans text-[14px] text-muted-foreground">
        No account?{" "}
        <Link href="/auth/sign-up" className="text-foreground underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
