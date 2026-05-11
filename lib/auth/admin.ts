import { getAuth } from "@/lib/auth/server";
import { readEnv } from "@/lib/env";

export interface SessionUserInfo {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

function parseAdminEmails(): Set<string> {
  const raw = readEnv("ADMIN_USER_EMAILS");
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.trim().toLowerCase());
}

export async function getSessionUser(): Promise<SessionUserInfo | null> {
  const { data: session } = await getAuth().getSession();
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  if (!user?.id) return null;
  const email = (user.email ?? null) as string | null;
  return {
    id: user.id,
    email,
    isAdmin: isAdminEmail(email),
  };
}
