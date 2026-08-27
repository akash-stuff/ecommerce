import { apiClient, unwrap } from './api-client';
import type { PaginationMeta } from '@/types/api';

export interface PlatformTenant {
  id: string;
  slug: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  businessCategory: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  store?: { name: string; isPublished: boolean } | null;
  domains?: { hostname: string; isPrimary: boolean }[];
  /** `orders` is what decides whether this store may be deleted at all. */
  _count?: { users?: number; products?: number; orders?: number };
}

export interface PlatformPlan {
  id: string;
  name: string;
  slug: string;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  maxProducts: number | null;
  maxStaff: number | null;
  maxOrdersMonth: number | null;
  customDomain: boolean;
  isActive: boolean;
  _count: { subscriptions: number };
}

export interface TemplateTheme {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  bodyFont?: string;
  headingFont?: string;
  /** Named page background the template ships with. */
  background?: string;
  /** Header logo height that suits the template's proportions. */
  logoSize?: string;
}

export interface PlatformTemplate {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  previewImage: string | null;
  defaultTheme: TemplateTheme;
  layoutConfig: { sections?: string[] };
  isActive: boolean;
  _count: { stores: number };
}

/** The gallery shape: active templates only, without the store counts. */
export type TemplateChoice = Pick<
  PlatformTemplate,
  'id' | 'name' | 'slug' | 'category' | 'description' | 'previewImage' | 'defaultTheme'
>;

export interface PlatformOverview {
  range: { days: number };
  tenants: {
    total: number;
    active: number;
    suspended: number;
    pending: number;
    cancelled: number;
    newInRange: number;
  };
  catalogue: { products: number; customers: number };
  grossMerchandiseValue: string;
  orders: number;
  topTenants: {
    id: string;
    slug: string;
    businessName: string;
    orders: number;
    revenue: string;
  }[];
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { email: string; firstName: string; lastName: string } | null;
  tenant: { slug: string; businessName: string } | null;
}

const paged = <T>(promise: Promise<{ data: { data: T[]; meta: PaginationMeta } }>) =>
  promise.then((r) => ({ items: r.data.data, meta: r.data.meta }));

/** One store's numbers, the shape the platform console reads them in. */
export interface StoreBreakdown {
  tenant: {
    id: string;
    slug: string;
    businessName: string;
    storeName: string;
    status: string;
    isPublished: boolean;
    currency: string;
    contactEmail: string;
    plan: string | null;
    createdAt: string;
  };
  range: { days: number; from: string; to: string };
  revenue: { total: string; previous: string; changePercent: number | null };
  orders: {
    count: number;
    previous: number;
    averageValue: string;
    byStatus: Record<string, number>;
  };
  catalogue: { products: number; live: number; customers: number };
  topProducts: { id: string; name: string; sku: string; unitsSold: number; revenue: string }[];
}

/** A message, with the store it belongs to resolved server-side. */
export interface PlatformNotification {
  id: string;
  tenantId: string | null;
  channel: string;
  event: string;
  recipient: string;
  subject: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  store: { slug: string; businessName: string } | null;
}

export const platformService = {
  overview: (days = 30) =>
    unwrap<PlatformOverview>(apiClient.get('/platform/analytics/overview', { params: { days } })),

  tenants: (params: { page?: number; limit?: number; search?: string; status?: string }) =>
    paged<PlatformTenant>(apiClient.get('/platform/tenants', { params })),

  /**
   * Creates the tenant, its store, its theme, its platform subdomain and its
   * owner account in one transaction — see TenantsService.create.
   */
  createTenant: (payload: {
    businessName: string;
    slug: string;
    storeName: string;
    /** The business contact address. Named `email` to match CreateTenantDto. */
    email: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerFirstName: string;
    templateId?: string;
    planId?: string;
  }) => unwrap<PlatformTenant>(apiClient.post('/platform/tenants', payload)),

  suspendTenant: (id: string, reason: string) =>
    unwrap<PlatformTenant>(apiClient.patch(`/platform/tenants/${id}/suspend`, { reason })),

  activateTenant: (id: string) =>
    unwrap<PlatformTenant>(apiClient.patch(`/platform/tenants/${id}/activate`, {})),

  plans: () => unwrap<PlatformPlan[]>(apiClient.get('/platform/plans')),

  createPlan: (payload: Record<string, unknown>) =>
    unwrap<PlatformPlan>(apiClient.post('/platform/plans', payload)),

  updatePlan: (id: string, payload: Record<string, unknown>) =>
    unwrap<PlatformPlan>(apiClient.put(`/platform/plans/${id}`, payload)),

  retirePlan: (id: string) => unwrap<PlatformPlan>(apiClient.delete(`/platform/plans/${id}`)),

  templates: () => unwrap<PlatformTemplate[]>(apiClient.get('/platform/templates')),

  /** Active templates only — what a new store may actually be built from. */
  templateGallery: () => unwrap<TemplateChoice[]>(apiClient.get('/platform/templates/gallery')),

  templateOptions: () =>
    unwrap<{
        fonts: string[];
        sections: string[];
        backgrounds: string[];
        logoSizes: string[];
      }>(
      apiClient.get('/platform/templates/options'),
    ),

  createTemplate: (payload: Record<string, unknown>) =>
    unwrap<PlatformTemplate>(apiClient.post('/platform/templates', payload)),

  updateTemplate: (id: string, payload: Record<string, unknown>) =>
    unwrap<PlatformTemplate>(apiClient.put(`/platform/templates/${id}`, payload)),

  deleteTemplate: (id: string) => unwrap<void>(apiClient.delete(`/platform/templates/${id}`)),

  /** One store's analytics, for the per-store view on the overview. */
  storeBreakdown: (tenantId: string, days: number) =>
    unwrap<StoreBreakdown>(
      apiClient.get(`/platform/analytics/stores/${tenantId}`, { params: { days } }),
    ),

  /**
   * Every store's messages. Only the platform console can call this — a store
   * admin's own `/notifications` stays scoped to its tenant.
   */
  notifications: (params: {
    page?: number;
    limit?: number;
    tenantId?: string;
    status?: string;
    search?: string;
  }) =>
    apiClient
      .get('/platform/notifications', { params })
      .then((r) => ({
        items: r.data.data as PlatformNotification[],
        meta: r.data.meta as PaginationMeta,
      })),

  /**
   * Permanent. `confirmSlug` has to match the store's slug — the API refuses
   * otherwise, and refuses outright once the store has taken an order.
   */
  deleteTenant: (id: string, confirmSlug: string) =>
    unwrap<{ deleted: true; slug: string }>(
      apiClient.delete(`/platform/tenants/${id}`, { data: { confirmSlug } }),
    ),

  updateTenant: (id: string, payload: Record<string, unknown>) =>
    unwrap<PlatformTenant>(apiClient.patch(`/platform/tenants/${id}`, payload)),

  audit: (params: { page?: number; limit?: number; action?: string; tenantId?: string }) =>
    paged<AuditRow>(apiClient.get('/platform/audit', { params })),
};
