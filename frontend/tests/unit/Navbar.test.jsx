import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../../src/components/Navbar";

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
}

describe("Navbar", () => {
  it("renders all real routes", () => {
    renderNavbar();
    // Multiple appearances OK (desktop + mobile menu); just assert presence
    expect(screen.getAllByRole("link", { name: /home/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /satellites/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /launches/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /tracking/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /about/i }).length).toBeGreaterThan(0);
  });

  it("has NO /gallery link (regression guard for ghost route bug)", () => {
    renderNavbar();
    const links = screen.queryAllByRole("link", { name: /gallery/i });
    expect(links).toHaveLength(0);
  });

  it("has NO disabled 'Live Tracking: ON' decoration button (regression guard)", () => {
    renderNavbar();
    const btn = screen.queryByRole("button", { name: /Live Tracking: ON/i });
    expect(btn).toBeNull();
  });

  it("renders the UTC clock", () => {
    renderNavbar();
    expect(screen.getByText(/UTC Time:/i)).toBeInTheDocument();
  });
});
