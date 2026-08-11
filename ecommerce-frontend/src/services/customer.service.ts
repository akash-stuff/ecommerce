import { apiClient, setAccessToken, unwrap } from './api-client';
import type { Order, PaginationMeta } from '@/types/api';

export interface CustomerProfile {
  kind: 'customer';
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  orderCount: number;
  createdAt: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Storefront customer accounts.
 *
 * A customer is tenant-scoped: the same email at two stores is two unrelated
 * accounts, so nothing here is shared across hostnames. The access token lives
 * in memory and only the refresh token is persisted, matching the staff flow.
 */
function keep(tokens: TokenPair): TokenPair {
  setAccessToken(tokens.accessToken);
  localStorage.setItem('refresh_token', tokens.refreshToken);
  return tokens;
}

export const customerService = {
  register: (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    phone?: string;
  }) => unwrap<TokenPair>(apiClient.post('/auth/customer/register', payload)).then(keep),

  login: (email: string, password: string) =>
    unwrap<TokenPair>(apiClient.post('/auth/customer/login', { email, password })).then(keep),

  me: () => unwrap<CustomerProfile>(apiClient.get('/auth/me')),

  logout: async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      await apiClient.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    setAccessToken(null);
    localStorage.removeItem('refresh_token');
  },

  myOrders: (params: { page?: number; limit?: number } = {}) =>
    apiClient
      .get('/orders/mine', { params })
      .then((r) => ({ items: r.data.data as Order[], meta: r.data.meta as PaginationMeta })),

  myOrder: (orderNumber: string) =>
    unwrap<Order>(apiClient.get(`/orders/mine/${orderNumber}`)),

  cancelMyOrder: (orderNumber: string, reason?: string) =>
    unwrap<Order>(apiClient.post(`/orders/mine/${orderNumber}/cancel`, { reason })),
};
