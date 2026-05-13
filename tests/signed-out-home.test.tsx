import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignedOutHome } from "@/components/signed-out-home";
import { makeListedLeaderboardEntry } from "@/tests/fixtures/leaderboard-entry";

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

afterEach(() => {
  cleanup();
});

describe("SignedOutHome", () => {
  it("renders sign-up + sign-in CTAs when signed-out", () => {
    render(
      <SignedOutHome
        signInHref="/auth/sign-in?x=1"
        signUpHref="/auth/sign-up?x=1"
        leaderboardHref="/leaderboard"
        preview={[]}
      />,
    );

    expect(screen.getByRole("link", { name: /start a map/i })).toHaveAttribute(
      "href",
      "/auth/sign-up?x=1",
    );
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/auth/sign-in?x=1",
    );
    expect(screen.queryByRole("link", { name: /start a new map/i })).toBeNull();
  });

  it("renders 'Start a new map' linking to /create when signed-in", () => {
    render(
      <SignedOutHome
        isSignedIn
        signInHref="/auth/sign-in"
        signUpHref="/auth/sign-up"
        leaderboardHref="/leaderboard"
        preview={[]}
      />,
    );

    expect(screen.getByRole("link", { name: /start a new map/i })).toHaveAttribute(
      "href",
      "/create",
    );
    expect(screen.queryByRole("link", { name: /sign in/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^start a map$/i })).toBeNull();
  });

  it("shows the browse hero, start CTA, and the spotlight grid", () => {
    const preview = [
      makeListedLeaderboardEntry({ id: "1", slug: "first", storyTitle: "Featured story" }),
      makeListedLeaderboardEntry({ id: "2", slug: "second", storyTitle: "Second" }),
      makeListedLeaderboardEntry({ id: "3", slug: "third", storyTitle: "Third" }),
      makeListedLeaderboardEntry({ id: "4", slug: "fourth", storyTitle: "Fourth" }),
    ];

    render(
      <SignedOutHome
        signInHref="/auth/sign-in?x=1"
        signUpHref="/auth/sign-up?x=1"
        leaderboardHref="/leaderboard"
        preview={preview}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/browse maps/i);
    expect(screen.getByRole("link", { name: /start a map/i })).toHaveAttribute(
      "href",
      "/auth/sign-up?x=1",
    );
    expect(screen.getByRole("link", { name: /^browse maps/i })).toHaveAttribute(
      "href",
      "/gallery",
    );

    const spotlights = screen.getByRole("region", { name: /top spotlights/i });
    expect(spotlights).toBeInTheDocument();
    expect(screen.getByText("Featured story")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("renders an empty-state spotlight panel when there are no entries", () => {
    render(
      <SignedOutHome
        signInHref="/auth/sign-in"
        signUpHref="/auth/sign-up"
        leaderboardHref="/leaderboard"
        preview={[]}
      />,
    );

    // The section still renders so the layout stays viewport-locked; the
    // panel just shows an empty-state line instead of cards.
    const spotlights = screen.getByRole("region", { name: /top spotlights/i });
    expect(spotlights).toBeInTheDocument();
    expect(spotlights).toHaveTextContent(/no spotlights yet/i);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector("#create-map-topic")).toBeNull();
  });
});
