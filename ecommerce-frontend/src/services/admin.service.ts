import { apiClient, unwrap } from './api-client';
import type {
  AdminBanner,
  AdminOrder,
  AdminOrderRow,
  BannerPlacement,
  Category,
  CategoryNode,
  Coupon,
  InventoryTransaction,
  PaginationMeta,
  ShippingMethod,
  ShippingZone,
} from '@/types/api';

interface Paged<T> {
  items: T[];
  meta: PaginationMeta;
}

/** List endpoints share the `{ data, meta }` envelope; this flattens it once. */
const paged = <T>(promise: Promise<{ data: { data: T[]; meta: PaginationMeta } }>) =>
  promise.then((r) => ({ items: r.data.data, meta: r.data.meta }) as Paged<T>);

export const orderService = {
  list: (params: { page?: number; limit?: number; status?: string; search?: string }) =>
    paged<AdminOrderRow>(apiClient.get('/orders', { params })),

  get: (id: string) => unwrap<AdminOrder>(apiClient.get(`/orders/${id}`)),

  setStatus: (id: string, status: string, reason?: string) =>
    unwrap<AdminOrder>(apiClient.patch(`/orders/${id}/status`, { status, reason })),

  /** COD's equivalent of a payment webhook, performed by a person. */
  markCollected: (id: string) =>
    unwrap<AdminOrder>(apiClient.post(`/payments/orders/${id}/collected`, {})),
};

export const categoryService = {
  list: (params: { page?: number; limit?: number; search?: string }) =>
    paged<Category>(apiClient.get('/categories', { params })),

  tree: () => unwrap<CategoryNode[]>(apiClient.get('/categories/tree')),

  create: (payload: Partial<Category>) =>
    unwrap<Category>(apiClient.post('/categories', payload)),

  update: (id: string, payload: Partial<Category>) =>
    unwrap<Category>(apiClient.put(`/categories/${id}`, payload)),

  remove: (id: string) => apiClient.delete(`/categories/${id}`),
};

export const couponService = {
  list: (params: { page?: number; limit?: number; search?: string }) =>
    paged<Coupon>(apiClient.get('/coupons', { params })),

  create: (payload: Record<string, unknown>) =>
    unwrap<Coupon>(apiClient.post('/coupons', payload)),

  update: (id: string, payload: Record<string, unknown>) =>
    unwrap<Coupon>(apiClient.put(`/coupons/${id}`, payload)),

  deactivate: (id: string) => unwrap<Coupon>(apiClient.delete(`/coupons/${id}`)),
};

export const shippingService = {
  zones: () => unwrap<ShippingZone[]>(apiClient.get('/shipping/zones')),

  createZone: (payload: Record<string, unknown>) =>
    unwrap<ShippingZone>(apiClient.post('/shipping/zones', payload)),

  updateZone: (id: string, payload: Record<string, unknown>) =>
    unwrap<ShippingZone>(apiClient.put(`/shipping/zones/${id}`, payload)),

  removeZone: (id: string) => apiClient.delete(`/shipping/zones/${id}`),

  createMethod: (payload: Record<string, unknown>) =>
    unwrap<ShippingMethod>(apiClient.post('/shipping/methods', payload)),

  updateMethod: (id: string, payload: Record<string, unknown>) =>
    unwrap<ShippingMethod>(apiClient.put(`/shipping/methods/${id}`, payload)),

  removeMethod: (id: string) => apiClient.delete(`/shipping/methods/${id}`),
};

export interface UploadedMedia {
  key: string;
  url: string;
  bytes: number;
  contentType: string;
}

export const mediaService = {
  /**
   * `Content-Type` is set to undefined deliberately: the browser has to write
   * it, because only it knows the multipart boundary. The axios instance
   * defaults to application/json, which would make the body unparseable.
   */
  upload: (file: File, purpose: 'product' | 'theme' | 'banner' = 'product') => {
    const form = new FormData();
    form.append('file', file);
    return unwrap<UploadedMedia>(
      apiClient.post('/media/upload', form, {
        params: { purpose },
        headers: { 'Content-Type': undefined },
      }),
    );
  },
};

export const bannerAdminService = {
  list: (placement?: BannerPlacement) =>
    unwrap<AdminBanner[]>(
      apiClient.get('/banners/admin', { params: placement ? { placement } : {} }),
    ),

  placements: () =>
    unwrap<{ placements: BannerPlacement[] }>(apiClient.get('/banners/placements')),

  create: (payload: Record<string, unknown>) =>
    unwrap<AdminBanner>(apiClient.post('/banners', payload)),

  update: (id: string, payload: Record<string, unknown>) =>
    unwrap<AdminBanner>(apiClient.put(`/banners/${id}`, payload)),

  remove: (id: string) => apiClient.delete(`/banners/${id}`),
};

export const inventoryService = {
  history: (params: { page?: number; limit?: number; productId?: string }) =>
    paged<InventoryTransaction>(apiClient.get('/inventory/transactions', { params })),

  adjust: (payload: {
    productId: string;
    variantId?: string;
    quantityDelta: number;
    reason: string;
    note?: string;
    reference?: string;
  }) => unwrap<InventoryTransaction>(apiClient.post('/inventory/adjust', payload)),
};
