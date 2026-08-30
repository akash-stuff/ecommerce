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

  /**
   * Switches a coupon on or off. Reversible, and what most days want: a
   * campaign that has ended is switched off, not destroyed, because the orders
   * it discounted are still being looked at.
   */
  setActive: (id: string, isActive: boolean) =>
    unwrap<Coupon>(apiClient.patch(`/coupons/${id}/active`, { isActive })),

  /**
   * Gone for good. The API refuses with `COUPON_IN_USE` when the coupon has
   * been redeemed, because deleting it would take the redemption record with
   * it — so the console offers this and lets the server be the authority on
   * whether it is allowed.
   */
  remove: (id: string) => apiClient.delete(`/coupons/${id}`),
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

/**
 * A template as the store owner sees it: the look, and which homepage sections
 * it turns on. Distinct from the platform console's `PlatformTemplate` because
 * a shopkeeper has no business seeing how many other stores use it.
 */
export interface StoreTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  previewImage: string | null;
  defaultTheme: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    bodyFont?: string;
    headingFont?: string;
  };
  layoutConfig: { sections?: string[] };
}

export const themeService = {
  templates: () => unwrap<StoreTemplate[]>(apiClient.get('/theme/templates')),

  /**
   * Adopts the template's colours, fonts and homepage sections. The logo,
   * favicon and custom CSS survive unless explicitly cleared — the API decides
   * that, not this call, so leaving the flags off is the safe default.
   */
  applyTemplate: (payload: {
    templateId: string;
    keepLogo?: boolean;
    keepCustomCss?: boolean;
  }) => unwrap<unknown>(apiClient.post('/theme/template', payload)),
};

/** One credential a gateway asks for, as the API describes it. */
export interface GatewayCredentialField {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  hint?: string;
}

/**
 * A store's connection to one payment provider.
 *
 * There is no field for a secret's value, on purpose: the API returns which
 * secrets are set, never what they are. `secretsSet` is what lets the form show
 * "saved" beside a field the shopkeeper does not need to retype.
 */
export interface PaymentGateway {
  provider: string;
  label: string | null;
  isEnabled: boolean;
  publicKey: string | null;
  secretsSet: string[];
  /** Enabled *and* complete — the only state checkout will offer. */
  ready: boolean;
  credentialFields: GatewayCredentialField[];
  updatedAt: string | null;
}

export const paymentGatewayService = {
  list: () => unwrap<PaymentGateway[]>(apiClient.get('/payments/gateways')),

  /**
   * Omit a secret to keep the stored value; send an empty string to clear it.
   * The form relies on that distinction, because it never holds the real value
   * to send back.
   */
  save: (
    provider: string,
    payload: {
      isEnabled?: boolean;
      publicKey?: string;
      label?: string;
      secrets?: Record<string, string>;
    },
  ) => unwrap<PaymentGateway[]>(apiClient.put(`/payments/gateways/${provider}`, payload)),

  disconnect: (provider: string) =>
    unwrap<PaymentGateway[]>(apiClient.delete(`/payments/gateways/${provider}`)),
};

export interface UploadedMedia {
  key: string;
  url: string;
  bytes: number;
  contentType: string;
}

/** What a store's own upload is filed under. */
export type TenantUploadPurpose = 'product' | 'theme' | 'banner' | 'category' | 'page';

/**
 * Platform-level uploads, which belong to no store. The API serves these on a
 * separate route because the platform console has no tenant to file under.
 */
export type PlatformUploadPurpose = 'template';

export type UploadPurpose = TenantUploadPurpose | PlatformUploadPurpose;

const PLATFORM_PURPOSES: PlatformUploadPurpose[] = ['template'];

export const mediaService = {
  /**
   * `Content-Type` is set to undefined deliberately: the browser has to write
   * it, because only it knows the multipart boundary. The axios instance
   * defaults to application/json, which would make the body unparseable.
   *
   * The route is chosen from the purpose rather than passed in, so a caller
   * cannot pair a template thumbnail with the tenant endpoint — which would be
   * a 404 from TenantGuard on the platform console, where there is no tenant.
   */
  upload: (file: File, purpose: UploadPurpose = 'product') => {
    const form = new FormData();
    form.append('file', file);

    const path = PLATFORM_PURPOSES.includes(purpose as PlatformUploadPurpose)
      ? '/platform/media/upload'
      : '/media/upload';

    return unwrap<UploadedMedia>(
      apiClient.post(path, form, {
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

export interface NewsletterSubscriber {
  id: string;
  email: string;
  source: string;
  unsubscribedAt: string | null;
  createdAt: string;
}

export const subscriberService = {
  list: (params: { page?: number; limit?: number; search?: string; subscribed?: boolean }) =>
    paged<NewsletterSubscriber>(apiClient.get('/newsletter', { params })),

  unsubscribe: (id: string) =>
    unwrap<{ id: string; unsubscribedAt: string }>(
      apiClient.post(`/newsletter/${id}/unsubscribe`),
    ),

  remove: (id: string) => apiClient.delete(`/newsletter/${id}`),

  /**
   * Fetched as a blob and saved from memory rather than linked to directly.
   *
   * The CSV route needs the bearer token, and a plain <a href> carries no
   * Authorization header — it would land on the login page instead of a file.
   */
  exportCsv: async () => {
    const response = await apiClient.get('/newsletter/export.csv', { responseType: 'blob' });
    return response.data as Blob;
  },
};

export interface StaffMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: 'TENANT_OWNER' | 'TENANT_ADMIN' | 'STAFF';
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** True for the signed-in person, so the UI can disable self-lockout. */
  isSelf: boolean;
  permissions: string[];
}

export const staffService = {
  list: (params: { page?: number; limit?: number; search?: string; isActive?: boolean }) =>
    paged<StaffMember>(apiClient.get('/staff', { params })),

  /**
   * The response carries `temporaryPassword` exactly once, for a genuinely new
   * account. It is null when the person already had one — being added to a
   * second store must not reset the password they use for the first.
   */
  create: (payload: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: 'TENANT_ADMIN' | 'STAFF';
  }) =>
    unwrap<StaffMember & { temporaryPassword: string | null }>(
      apiClient.post('/staff', payload),
    ),

  update: (id: string, payload: { role?: 'TENANT_ADMIN' | 'STAFF'; isActive?: boolean }) =>
    unwrap<{ id: string; role: string; isActive: boolean }>(apiClient.put(`/staff/${id}`, payload)),

  resetPassword: (id: string) =>
    unwrap<{ temporaryPassword: string }>(apiClient.post(`/staff/${id}/reset-password`)),

  remove: (id: string) => apiClient.delete(`/staff/${id}`),
};

/** What an invoice prints as the seller, and what it falls back to. */
export interface InvoiceSettings {
  businessName: string | null;
  gstin: string | null;
  pan: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  email: string | null;
  phone: string | null;
  prefix: string;
  notes: string | null;
  /**
   * What an invoice would actually print right now, fallbacks applied. The form
   * shows this so a store that has filled in nothing can see that its invoices
   * already work rather than assuming they do not.
   */
  effective: {
    name: string;
    lines: string[];
    gstin: string | null;
    pan: string | null;
    email: string | null;
    phone: string | null;
    state: string | null;
  };
}

export const invoiceService = {
  settings: () => unwrap<InvoiceSettings>(apiClient.get('/invoices/settings')),

  saveSettings: (payload: Record<string, string>) =>
    unwrap<InvoiceSettings>(apiClient.put('/invoices/settings', payload)),

  /**
   * The PDF for one order, from the admin console.
   *
   * Fetched as a blob and saved from memory rather than linked to directly:
   * the route needs the bearer token, and a plain <a href> carries no
   * Authorization header — the same reason the subscriber export works this way.
   */
  download: async (orderId: string) => {
    const response = await apiClient.get(`/invoices/orders/${orderId}`, {
      responseType: 'blob',
    });
    return {
      blob: response.data as Blob,
      disposition: response.headers['content-disposition'] as string | undefined,
    };
  },
};
