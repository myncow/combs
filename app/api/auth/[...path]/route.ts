import { getAuth } from "@/lib/auth/server";

type AuthHandler = ReturnType<ReturnType<typeof getAuth>["handler"]>;

export const GET = (...args: Parameters<AuthHandler["GET"]>) => getAuth().handler().GET(...args);
export const POST = (...args: Parameters<AuthHandler["POST"]>) => getAuth().handler().POST(...args);
