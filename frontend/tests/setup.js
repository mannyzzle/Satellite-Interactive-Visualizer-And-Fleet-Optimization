import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Always release the JSDOM tree between tests
afterEach(() => {
  cleanup();
});

// jsdom doesn't ship IntersectionObserver — Three.js setup uses it
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

// Don't actually fire setInterval timers from Date(...) updates etc.
// Tests can opt-in to fake timers with vi.useFakeTimers() per-suite.

// Stub out matchMedia (some MUI components query it)
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
