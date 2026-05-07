"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth/client";

export function NeonAuthProviders({ children }: { children: ReactNode }) {
  return (
    <NeonAuthUIProvider authClient={authClient} social={{ providers: ["google"] }}>
      {children}
    </NeonAuthUIProvider>
  );
}
