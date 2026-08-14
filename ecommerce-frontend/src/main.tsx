import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes';
import { onSessionExpiredHandler } from './services/api-client';
import { useAuthStore } from './store/auth.store';
import { useCustomerStore } from './store/customer.store';
import { isAdminHost } from './config/env';
import { queryClient } from './lib/query-client';
import './index.css';

onSessionExpiredHandler(() => {
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
  queryClient.clear();
});

/**
 * Only one kind of session can exist per hostname: staff on the admin console,
 * customers on a storefront. Hydrating both would have them fight over the same
 * refresh token and the loser would be signed out at random.
 *
 * Not awaited: the router renders immediately and the guards show their
 * "checking your session" state until the exchange settles.
 */
if (isAdminHost()) {
  void useAuthStore.getState().hydrate();
} else {
  void useCustomerStore.getState().hydrate();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
