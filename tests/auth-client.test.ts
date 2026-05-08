import { describe, expect, it, vi } from "vitest";

const mockCreateAuthClient = vi.fn(() => ({ signIn: {}, useSession: vi.fn() }));

vi.mock("@neondatabase/auth/next", () => ({
  createAuthClient: mockCreateAuthClient,
}));

describe("auth client configuration", () => {
  it("uses the Neon Next.js auth client entry", async () => {
    const mod = await import("@/lib/auth/client");

    expect(mockCreateAuthClient).toHaveBeenCalledWith();
    expect(mod.authClient).toBe(mockCreateAuthClient.mock.results[0]?.value);
  });
});
