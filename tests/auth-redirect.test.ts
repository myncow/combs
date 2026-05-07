import { describe, expect, it } from "vitest";
import { buildAuthRedirectHref, sanitizeRedirectTo } from "@/lib/auth/redirect";

describe("auth redirect helpers", () => {
  it("keeps local redirect targets", () => {
    expect(sanitizeRedirectTo("/maps/example?topic=chairs")).toBe("/maps/example?topic=chairs");
  });

  it("rejects absolute or protocol-relative redirect targets", () => {
    expect(sanitizeRedirectTo("https://example.com")).toBe("/");
    expect(sanitizeRedirectTo("//example.com")).toBe("/");
    expect(sanitizeRedirectTo("javascript:alert(1)")).toBe("/");
  });

  it("builds a sign-in href that preserves the current route", () => {
    expect(buildAuthRedirectHref("/auth/sign-in", "/leaderboard", "sort=top")).toBe(
      "/auth/sign-in?redirectTo=%2Fleaderboard%3Fsort%3Dtop",
    );
  });
});
