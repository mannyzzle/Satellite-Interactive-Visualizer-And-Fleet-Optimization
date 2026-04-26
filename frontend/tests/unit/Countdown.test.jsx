// Vitest unit test for the per-card countdown leaf component on Launches.
//
// Why we care: previously the parent component recomputed all countdowns via
// `setCountdowns({...})` every second, re-rendering every motion-card. The
// new <Countdown /> owns its own 1Hz interval and writes via ref. Validate
// it actually ticks without touching React state.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { Countdown } from "../../src/pages/Launches";

describe("<Countdown />", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the formatted remaining time on mount", () => {
    // 2 days, 3 hours, 4 minutes, 5 seconds out
    const target = new Date(
      Date.now() + (2 * 24 * 3600 + 3 * 3600 + 4 * 60 + 5) * 1000
    );
    const { container } = render(<Countdown launchDate={target.toISOString()} />);
    expect(container.textContent).toMatch(/^2d 3h 4m 5s$/);
  });

  it("ticks down one second per setInterval fire", () => {
    const target = new Date(Date.now() + 65_000); // 1m 5s out
    const { container } = render(<Countdown launchDate={target.toISOString()} />);
    expect(container.textContent).toMatch(/0d 0h 1m 5s/);

    vi.advanceTimersByTime(1000);
    expect(container.textContent).toMatch(/0d 0h 1m 4s/);

    vi.advanceTimersByTime(5000);
    expect(container.textContent).toMatch(/0d 0h 0m 59s/);
  });

  it("shows '🚀 Launched!' when the target is in the past", () => {
    const past = new Date(Date.now() - 5_000);
    const { container } = render(<Countdown launchDate={past.toISOString()} />);
    expect(container.textContent).toBe("🚀 Launched!");
  });

  it("handles missing launchDate gracefully", () => {
    const { container } = render(<Countdown launchDate={null} />);
    expect(container.textContent).toBe("🚀 Launched!");
  });
});
