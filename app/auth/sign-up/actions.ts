"use server";

import { auth } from "@/lib/auth/server";
import { sanitizeRedirectTo } from "@/lib/auth/redirect";
import { redirect } from "next/navigation";

export async function signUpWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const redirectTo = sanitizeRedirectTo(formData.get("redirectTo"));
  const email = formData.get("email") as string;

  if (!email?.trim()) {
    return { error: "Email is required." };
  }

  const { error } = await auth.signUp.email({
    email,
    name: formData.get("name") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message || "Could not create account." };
  }

  redirect(redirectTo);
}
