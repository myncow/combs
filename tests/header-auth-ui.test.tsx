import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeaderAuth } from "@/components/header-auth";

const { mockUseSession, mockSignOut } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/maps/abc",
  useSearchParams: () => new URLSearchParams("?q=1"),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}));

describe("HeaderAuth", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
    mockSignOut.mockReset();
  });

  it("shows signed-out label, icon, and sign-in control", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(<HeaderAuth />);

    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^sign in$/i })).toHaveAttribute(
      "href",
      "/auth/sign-in?redirectTo=" + encodeURIComponent("/maps/abc?q=1"),
    );
  });

  it("shows signed-in label, user affordance, account link, and sign-out", () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: "u1",
          name: "Ada",
          email: "ada@example.com",
        },
      },
      isPending: false,
    });

    render(<HeaderAuth />);

    expect(screen.getByText("Signed in")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});
