"use server";

import { auth } from "@/lib/auth/server";
import { sanitizeRedirectTo } from "@/lib/auth/redirect";
import { redirect } from "next/navigation";

export async function signInWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const redirectTo = sanitizeRedirectTo(formData.get("redirectTo"));
  const { error } = await auth.signIn.email({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message || "Could not sign in." };
  }

  redirect(redirectTo);
}
