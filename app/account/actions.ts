"use server";

import { getAuth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signOutServer() {
  await getAuth().signOut();
  redirect("/");
}
