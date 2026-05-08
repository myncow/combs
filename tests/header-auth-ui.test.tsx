import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HeaderAuth } from "@/components/header-auth";

type MockUser = { id: string; name?: string | null; email?: string | null };

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    current: { data: null, isPending: false } as {
      data: { user: MockUser } | null;
      isPending: boolean;
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
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
    useSession: () => mockSession.current,
    signOut: vi.fn(),
  },
}));

describe("HeaderAuth", () => {
  beforeEach(() => {
    mockSession.current = { data: null, isPending: false };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a single Sign in icon link when signed out", () => {
    render(<HeaderAuth />);

    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute(
      "href",
      "/auth/sign-in?redirectTo=" + encodeURIComponent("/maps/abc?q=1"),
    );
    expect(screen.queryByRole("button", { name: /account menu/i })).not.toBeInTheDocument();
  });

  it("shows the user's name on the account button when signed in", () => {
    mockSession.current = {
      data: { user: { id: "u1", name: "Armin", email: "armin@surreal.ai" } },
      isPending: false,
    };
    render(<HeaderAuth />);

    const button = screen.getByRole("button", { name: /account menu for armin/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Armin");
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("falls back to the email local-part when no display name is set", () => {
    mockSession.current = {
      data: { user: { id: "u1", email: "armin@surreal.ai" } },
      isPending: false,
    };
    render(<HeaderAuth />);

    const button = screen.getByRole("button", { name: /account menu for armin/i });
    expect(button).toHaveTextContent("armin");
  });

  it("renders an empty placeholder while session is resolving", () => {
    mockSession.current = { data: null, isPending: true };
    const { container } = render(<HeaderAuth />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.firstChild).toBeTruthy();
  });
});
