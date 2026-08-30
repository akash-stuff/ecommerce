import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';

/**
 * Renders a component with the providers it would have in the real app.
 *
 * A fresh QueryClient per test: sharing one lets a cached response from an
 * earlier test satisfy a later one, which passes until the tests are reordered.
 * Retries are off so a deliberate error case fails immediately instead of
 * taking the default backoff.
 */
export function render(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return { ...rtlRender(ui, { wrapper: Wrapper, ...options }), queryClient };
}

/**
 * Re-exported by name rather than with `export *`.
 *
 * A star re-export whose source also exports `render` collides with the local
 * `render` above, and Vite resolves the collision in Testing Library's favour:
 * every test that imported `render` from here was getting the bare one, with no
 * QueryClientProvider and no router. Nothing failed, because the components
 * tested first happened to need neither — it surfaced the first time a page
 * containing a `<Link>` was rendered, as a null router context.
 *
 * Anything else from Testing Library should be added to this list rather than
 * the list being replaced by a star.
 */
export {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
export type { RenderOptions, RenderResult } from '@testing-library/react';
