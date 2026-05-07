import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HeaderAuth } from "@/components/header-auth";

const { mockIsSignedIn } = vi.hoisted(() => ({
  mockIsSignedIn: { current: false },
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

vi.mock("@neondatabase/auth/react", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    mockIsSignedIn.current ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    mockIsSignedIn.current ? null : <>{children}</>,
  UserButton: () => <button type="button" aria-label="User menu">user menu</button>,
}));

describe("HeaderAuth", () => {
  beforeEach(() => {
    mockIsSignedIn.current = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows signed-out label with sign-in and create-account CTAs", () => {
    mockIsSignedIn.current = false;

    render(<HeaderAuth />);

    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^sign in$/i })).toHaveAttribute(
      "href",
      "/auth/sign-in?redirectTo=" + encodeURIComponent("/maps/abc?q=1"),
    );
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute(
      "href",
      "/auth/sign-up?redirectTo=" + encodeURIComponent("/maps/abc?q=1"),
    );
  });

  it("shows signed-in label and the Neon UserButton when authenticated", () => {
    mockIsSignedIn.current = true;

    render(<HeaderAuth />);

    expect(screen.getByText("Signed in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /user menu/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^sign in$/i })).not.toBeInTheDocument();
  });
});
