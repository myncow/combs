import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe("env helpers", () => {
  it("falls back to DATABASE_URL_UNPOOLED when DATABASE_URL is blank", async () => {
    process.env.DATABASE_URL = "   ";
    process.env.DATABASE_URL_UNPOOLED = "postgresql://example.test/neondb";

    const { getDatabaseUrl } = await import("@/lib/env");

    expect(getDatabaseUrl()).toBe("postgresql://example.test/neondb");
  });

  it("derives the Neon auth base URL from a pooled database URL", async () => {
    const { deriveNeonAuthBaseUrl } = await import("@/lib/env");

    expect(
      deriveNeonAuthBaseUrl(
        "postgresql://user:pass@ep-broad-rain-aji9dkvf-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe("https://ep-broad-rain-aji9dkvf.neonauth.c-3.us-east-2.aws.neon.tech/neondb/auth");
  });

  it("prefers the Vercel-provisioned preview auth URL over a stale manual override", async () => {
    process.env.VITE_NEON_AUTH_URL = "https://preview-auth.example.com/neondb/auth";
    process.env.NEON_AUTH_BASE_URL = "https://stale-auth.example.com/neondb/auth";

    const { getNeonAuthBaseUrl } = await import("@/lib/env");

    expect(getNeonAuthBaseUrl()).toBe("https://preview-auth.example.com/neondb/auth");
  });
});

describe("config env normalization", () => {
  it("uses default OpenRouter models when the env vars are blank strings", async () => {
    process.env.OPENROUTER_MODEL = "   ";
    process.env.OPENROUTER_FALLBACK_MODEL = "";

    const { appConfig } = await import("@/lib/config");

    expect(appConfig.openRouter.model).toBe("google/gemini-3.1-flash-lite-preview");
    expect(appConfig.openRouter.fallbackModel).toBe("google/gemini-3-flash-preview");
  });
});
