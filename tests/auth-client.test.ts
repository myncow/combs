import { describe, expect, it, vi } from "vitest";

const mockCreateAuthClient = vi.fn(() => ({ signIn: {}, useSession: vi.fn() }));
const mockBetterAuthReactAdapter = vi.fn(() => "adapter");

vi.mock("@neondatabase/auth", () => ({
  createAuthClient: mockCreateAuthClient,
}));

vi.mock("@neondatabase/auth/react", () => ({
  BetterAuthReactAdapter: mockBetterAuthReactAdapter,
}));

describe("auth client configuration", () => {
  it("pins the browser auth client to the local Next auth route", async () => {
    const mod = await import("@/lib/auth/client");

    expect(mockBetterAuthReactAdapter).toHaveBeenCalledTimes(1);
    expect(mockCreateAuthClient).toHaveBeenCalledWith("/api/auth", {
      adapter: "adapter",
    });
    expect(mod.authClient).toBe(mockCreateAuthClient.mock.results[0]?.value);
  });
});
