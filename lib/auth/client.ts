"use client";

import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react";

export const authClient = createAuthClient("/api/auth", {
  adapter: BetterAuthReactAdapter(),
});
