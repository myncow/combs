import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExplorerSidebar } from "@/components/explorer-sidebar";

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/map-card", () => ({
  MapCard: () => <li />,
}));

describe("ExplorerSidebar signed-out", () => {
  it("defaults to Top list and routes the New map CTA to home (sign-in is gated by submit)", () => {
    render(
      <ExplorerSidebar
        isSignedIn={false}
        initialMaps={{ items: [], total: 0 }}
        initialLeaderboard={[]}
      />,
    );

    expect(screen.getByRole("button", { name: /top list/i })).toHaveAttribute("aria-pressed", "true");
    const newMap = screen.getByRole("link", { name: /new map/i });
    expect(newMap).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: /create account/i })).toBeNull();
  });
});
