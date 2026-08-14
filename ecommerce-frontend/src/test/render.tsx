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

export * from '@testing-library/react';
