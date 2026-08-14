import { QueryClient } from '@tanstack/react-query';

/**
 * The single query cache, in its own module so non-React code can reach it.
 *
 * The customer store needs to clear per-customer caches when a session starts
 * or ends; a store that cannot invalidate leaves one shopper's saved items
 * visible to the next person using the same browser.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500) return false; // don't retry 4xx
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Everything that belongs to one signed-in shopper.
 *
 * Cleared on sign-in as well as sign-out: a guest's cached "not saved" answers
 * are wrong the moment an account is attached, and a shared browser must not
 * carry one customer's state into the next session.
 */
export function clearCustomerScopedQueries(): void {
  for (const key of ['wishlist', 'cart', 'my-orders', 'reviews']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
