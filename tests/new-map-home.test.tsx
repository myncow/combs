import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewMapHome } from "@/components/new-map-home";

vi.mock("@/components/create-map-form", () => ({
  CreateMapForm: () => <div data-testid="create-map-form" />,
}));

describe("NewMapHome", () => {
  it("still presents the builder shell with the create form", () => {
    render(<NewMapHome />);

    expect(screen.getByRole("heading", { name: /^new map$/i })).toBeInTheDocument();
    expect(screen.getByText(/suggested axes appear as you type/i)).toBeInTheDocument();
    expect(screen.getByTestId("create-map-form")).toBeInTheDocument();
  });
});
