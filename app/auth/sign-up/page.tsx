"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-5 py-14">
      <div>
        <h1 className="font-sans text-[32px] font-semibold tracking-[-0.015em] text-foreground">
          Create account
        </h1>
        <p className="mt-2 font-sans text-[15px] leading-[1.55] text-muted-foreground">
          Sign up with email to save preferences and unlock account-only features later.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Name
          </label>
          <Input id="name" name="name" type="text" required autoComplete="name" />
        </div>
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
            autoComplete="new-password"
          />
        </div>
        {state?.error ? (
          <p className="font-sans text-[14px] text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="font-sans text-[14px] text-muted-foreground">
        Already registered?{" "}
        <Link href="/auth/sign-in" className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
