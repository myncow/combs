"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signOutServer() {
  await auth.signOut();
  redirect("/");
}
