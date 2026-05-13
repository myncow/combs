import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExplorerSidebar } from "@/components/explorer-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/map-card", () => ({
  MapCard: () => <li />,
}));

describe("ExplorerSidebar", () => {
  it("renders only the personal library rail (no nav links, no sign-in CTAs)", () => {
    render(
      <ExplorerSidebar
        isSignedIn
        initialMaps={{ items: [], total: 0 }}
      />,
    );

    expect(screen.getByLabelText("My maps")).toBeInTheDocument();
    expect(screen.getByText(/no maps yet/i)).toBeInTheDocument();
    // Cross-app navigation belongs to the header / settings menu, not the rail.
    expect(screen.queryByRole("link", { name: /new map/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /leaderboard/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /admin/i })).toBeNull();
  });
});
