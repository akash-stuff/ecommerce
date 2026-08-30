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
