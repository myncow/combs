"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnlockHintIcon } from "@/components/auth-status-icon";
import { sanitizeRedirectTo } from "@/lib/auth/redirect";
import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);
  const redirectTo = sanitizeRedirectTo(searchParams.get("redirectTo"));
  const signInHref = `/auth/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 px-5 py-14">
      <div>
        <span className="inline-flex items-center gap-2 border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <UnlockHintIcon className="text-foreground/85" />
          Unlock generation
        </span>
        <h1 className="mt-3 inline-flex items-center gap-2 font-sans text-[32px] font-semibold tracking-[-0.015em] text-foreground">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden strokeWidth={2} />
          Create account
        </h1>
        <p className="mt-2 font-sans text-[15px] leading-[1.55] text-muted-foreground">
          Create an account with email to build maps and come back to what you were working on.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="redirectTo" value={redirectTo} />
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
        <Link href={signInHref} className="text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
