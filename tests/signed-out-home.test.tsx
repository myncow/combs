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

vi.mock("@/components/leaderboard-card", () => ({
  LeaderboardCard: ({ entry }: { entry: { storyTitle: string } }) => <article>{entry.storyTitle}</article>,
}));

afterEach(() => {
  cleanup();
});

describe("SignedOutHome", () => {
  it("shows concept copy, CTAs, leaderboard preview, and signed-out cue", () => {
    const preview = [
      makeListedLeaderboardEntry({ id: "1", storyTitle: "Featured story" }),
      makeListedLeaderboardEntry({ id: "2", storyTitle: "Second" }),
      makeListedLeaderboardEntry({ id: "3", storyTitle: "Third" }),
      makeListedLeaderboardEntry({ id: "4", storyTitle: "Fourth" }),
    ];

    render(
      <SignedOutHome
        signInHref="/auth/sign-in?x=1"
        signUpHref="/auth/sign-up?x=1"
        leaderboardHref="/leaderboard"
        preview={preview}
      />,
    );

    expect(screen.getByText(/two-axis visual maps/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute(
      "href",
      "/auth/sign-up?x=1",
    );
    expect(
      screen
        .getAllByRole("link", { name: /^sign in$/i })
        .some((el) => el.getAttribute("href") === "/auth/sign-in?x=1"),
    ).toBe(true);
    expect(screen.getByRole("link", { name: /view full top list/i })).toHaveAttribute("href", "/leaderboard");
    expect(screen.getByText("Featured story")).toBeInTheDocument();
    expect(screen.getByText(/signed out/i)).toBeInTheDocument();
  });

  it("does not render live builder controls (topic field, suggestions fetch, submit flow)", () => {
    render(
      <SignedOutHome
        signInHref="/auth/sign-in"
        signUpHref="/auth/sign-up"
        leaderboardHref="/leaderboard"
        preview={[]}
      />,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector("#create-map-topic")).toBeNull();
    expect(screen.queryByText(/sketching frames/i)).not.toBeInTheDocument();

    expect(screen.getByRole("region", { name: /locked builder preview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^build map$/i })).toBeDisabled();
  });
});
