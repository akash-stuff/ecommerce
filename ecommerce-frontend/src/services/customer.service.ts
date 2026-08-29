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
  /**
   * Starts a registration. Returns a challenge, not tokens — the account does
   * not exist until the emailed code is confirmed, so there is nothing to sign
   * in with yet.
   */
  register: (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    phone?: string;
  }) =>
    unwrap<{
      otpRequired: true;
      email: string;
      expiresInSeconds: number;
      resendInSeconds: number;
    }>(apiClient.post('/auth/customer/register', payload)),

  /** Confirms the code, which is what actually creates the account. */
  verifyEmail: (email: string, code: string) =>
    unwrap<TokenPair>(apiClient.post('/auth/customer/verify-email', { email, code })).then(keep),

  resendCode: (email: string) =>
    unwrap<{ sent: true }>(apiClient.post('/auth/customer/resend-code', { email })),

  /**
   * Starts a password reset. Always reports success — the API will not say
   * whether an account exists, so neither can this.
   */
  forgotPassword: (email: string) =>
    unwrap<{ sent: true }>(apiClient.post('/auth/customer/forgot-password', { email })),

  /** Sets the new password and signs in. Every other session is ended. */
  resetPassword: (email: string, code: string, password: string) =>
    unwrap<TokenPair>(
      apiClient.post('/auth/customer/reset-password', { email, code, password }),
    ).then(keep),

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

  /**
   * The shopper's own invoice, as a PDF.
   *
   * Fetched as a blob rather than linked to: the route is scoped to the signed-in
   * customer and needs the bearer token, and a plain <a href> carries no
   * Authorization header — it would download the sign-in page instead.
   */
  downloadInvoice: async (orderNumber: string) => {
    const response = await apiClient.get(`/invoices/orders/mine/${orderNumber}`, {
      responseType: 'blob',
    });
    return {
      blob: response.data as Blob,
      disposition: response.headers['content-disposition'] as string | undefined,
    };
  },
};
