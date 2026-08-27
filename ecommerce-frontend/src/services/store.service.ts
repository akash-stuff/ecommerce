import { apiClient, unwrap } from './api-client';
import type { Banner, BannerPlacement, Product, StoreConfig } from '@/types/api';

/**
 * The storefront's first call. Returns branding, template and metadata for
 * whichever tenant owns the current hostname.
 */
export const storeService = {
  getConfig: () => unwrap<StoreConfig>(apiClient.get('/store')),
};

/**
 * The payment methods this store has actually connected.
 *
 * Public, and computed server-side: whether a gateway is usable depends on
 * credentials the browser must never see, so the answer has to be a list of
 * names rather than something checkout works out for itself.
 */
export const paymentService = {
  providers: () =>
    unwrap<{ providers: string[] }>(apiClient.get('/payments/providers')).then(
      (r) => r.providers,
    ),

  /**
   * Starts a payment attempt against an order that already exists.
   *
   * The gateway order is created server-side, so the amount cannot be chosen by
   * the browser. What comes back is only what the widget needs to open.
   */
  initiate: (orderNumber: string, provider: string) =>
    unwrap<Record<string, unknown>>(
      apiClient.post('/payments/initiate', { orderNumber, provider }),
    ),

  /** Hands the gateway's signed success payload back for verification. */
  confirm: (orderNumber: string, provider: string, payload: Record<string, string>) =>
    unwrap<{ paid: boolean; orderNumber: string }>(
      apiClient.post('/payments/confirm', { orderNumber, provider, payload }),
    ),
};

export const bannerService = {
  /** Scheduling is applied server-side, so whatever comes back is showable. */
  live: (placement?: BannerPlacement) =>
    unwrap<Banner[]>(apiClient.get('/banners', { params: placement ? { placement } : {} })),
};

export const productService = {
  list: (params: Record<string, unknown> = {}) =>
    apiClient.get('/products', { params }).then((r) => ({
      items: r.data.data as Product[],
      meta: r.data.meta,
    })),

  getBySlug: (slug: string) => unwrap<Product>(apiClient.get(`/products/slug/${slug}`)),
  create: (payload: unknown) => unwrap<Product>(apiClient.post('/products', payload)),
  update: (id: string, payload: unknown) => unwrap<Product>(apiClient.put(`/products/${id}`, payload)),
  remove: (id: string) => apiClient.delete(`/products/${id}`),
};

/**
 * The storefront mailing-list panel.
 *
 * The reply is the same for a new address, a repeat and one that had opted out —
 * the server deliberately does not say which, so the form cannot be used to
 * test whether a given person shops here.
 */
export const newsletterService = {
  subscribe: (email: string) =>
    unwrap<{ subscribed: true }>(apiClient.post('/newsletter/subscribe', { email })),
};
