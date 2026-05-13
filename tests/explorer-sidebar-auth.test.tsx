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
  it("renders the personal library rail with a new-map shortcut and no other cross-app nav", () => {
    render(
      <ExplorerSidebar
        isSignedIn
        initialMaps={{ items: [], total: 0 }}
      />,
    );

    expect(screen.getByLabelText("My maps")).toBeInTheDocument();
    expect(screen.getByText(/no maps yet/i)).toBeInTheDocument();
    // The "+ New map" action is the only nav-style link allowed on the
    // rail — it pairs with the personal library it sits above.
    const newMapLink = screen.getByRole("link", { name: /new map/i });
    expect(newMapLink).toHaveAttribute("href", "/create");
    // Other cross-app navigation still belongs to the header / settings menu.
    expect(screen.queryByRole("link", { name: /leaderboard/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /admin/i })).toBeNull();
  });
});
