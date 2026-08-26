import { apiClient, unwrap } from './api-client';
import type { Banner, BannerPlacement, Product, StoreConfig } from '@/types/api';

/**
 * The storefront's first call. Returns branding, template and metadata for
 * whichever tenant owns the current hostname.
 */
export const storeService = {
  getConfig: () => unwrap<StoreConfig>(apiClient.get('/store')),
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
