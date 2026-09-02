import '@testing-library/jest-dom/vitest';

/**
 * `window.matchMedia`, which jsdom does not implement.
 *
 * A real gap in the environment rather than something to work around in the
 * components: any component that asks about `prefers-reduced-motion`, or about
 * a breakpoint, throws `matchMedia is not a function` on render — and the
 * failure names the test rather than the line that asked.
 *
 * The stub answers "no" to every query, which is the right default: reduced
 * motion off, no breakpoint matched. A test that needs a different answer can
 * spy on this and return its own.
 */
/**
 * `ResizeObserver`, which jsdom also does not implement.
 *
 * The stub observes nothing and fires nothing: jsdom lays nothing out, so there
 * is never a size change to report. Components that measure an element are
 * expected to take a first measurement themselves rather than wait for the
 * observer's initial callback — which is the right shape anyway, and what a
 * test asserting on layout has to stub `clientWidth` for regardless.
 */
if (typeof globalThis !== 'undefined' && !('ResizeObserver' in globalThis)) {
  class NoopResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = NoopResizeObserver;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
