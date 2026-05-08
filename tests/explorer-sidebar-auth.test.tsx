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

describe("ExplorerSidebar", () => {
  it("renders a single library rail with the New map CTA, no tabs or sign-in CTAs", () => {
    render(
      <ExplorerSidebar
        isSignedIn={false}
        initialMaps={{ items: [], total: 0 }}
      />,
    );

    const newMap = screen.getByRole("link", { name: /new map/i });
    expect(newMap).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: /^top list$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^maps$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /create account/i })).toBeNull();
  });
});
