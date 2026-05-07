import { auth } from "@/lib/auth/server";

const neonAuthProxy = auth.middleware({
  loginUrl: "/auth/sign-in",
});

export function proxy(...args: Parameters<typeof neonAuthProxy>) {
  return neonAuthProxy(...args);
}

export const config = {
  matcher: ["/account/:path*"],
};
