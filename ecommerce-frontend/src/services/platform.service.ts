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

export interface ContactEnquiry {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
  /** Rendered off-screen and left empty by anyone using a browser. */
  honeypot?: string;
}

/**
 * The landing page's contact form.
 *
 * Public and unauthenticated, which is why it sits apart from `platformService`
 * below — everything in there needs a super-admin token, and this needs none.
 * The route is throttled to two a minute, so a rejection is a real answer and
 * not something to retry behind the user's back.
 */
export const contactService = {
  send: (enquiry: ContactEnquiry) =>
    unwrap<{ sent: true }>(apiClient.post('/contact', enquiry)),
};

export type StoreRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISCARDED';

export interface StoreRequest {
  id: string;
  status: StoreRequestStatus;
  businessName: string;
  slug: string;
  businessCategory: string | null;
  message: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** The store it became, once approved. */
  tenantId: string | null;
  createdAt: string;
  reviewedBy: { email: string; firstName: string; lastName: string } | null;
}

export interface StoreRegistration {
  businessName: string;
  slug: string;
  businessCategory?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  message?: string;
  /** Rendered off-screen and left empty by anyone using a browser. */
  honeypot?: string;
}

/**
 * Registering for a store.
 *
 * Public and unauthenticated, so it sits with `contactService` rather than in
 * `platformService` below — everything in there needs a super-admin token.
 * The reply is `{ received: true }`, never a store: a registration is an
 * application, and a person decides it.
 */
export const registerService = {
  apply: (registration: StoreRegistration) =>
    unwrap<{ received: true }>(apiClient.post('/store-requests', registration)),
};

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

  /**
   * A new password for a store's owner, returned once and never again.
   *
   * `otherStores` is how many *other* stores the same login opens: a `User` is
   * platform-level, so one person running three shops has one password for all
   * three, and the console has to say so before the button is pressed.
   */
  resetOwnerPassword: (id: string) =>
    unwrap<{ email: string; temporaryPassword: string; otherStores: number }>(
      apiClient.post(`/platform/tenants/${id}/owner-password`, {}),
    ),

  /**
   * Another administrator for a store, added from the console.
   *
   * `temporaryPassword` is null when the address already had an account: they
   * keep the password they use for their other stores, and the console must not
   * offer to show one that was never issued.
   */
  addStoreAdmin: (
    id: string,
    payload: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      role?: 'TENANT_ADMIN' | 'STAFF';
    },
  ) =>
    unwrap<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: 'TENANT_ADMIN' | 'STAFF';
      temporaryPassword: string | null;
    }>(apiClient.post(`/platform/tenants/${id}/admins`, payload)),

  /** The registration queue, oldest pending first. */
  storeRequests: (params: { page?: number; limit?: number; search?: string; status?: string }) =>
    paged<StoreRequest>(apiClient.get('/platform/store-requests', { params })),

  /**
   * Approving provisions the store, so it is a POST and never a retry.
   *
   * The applicant signs in with the password they chose when they registered —
   * nothing is issued here and nothing is shown once, which is why this returns
   * the updated application rather than a credential.
   */
  approveStoreRequest: (id: string, payload: { planId?: string; templateId?: string }) =>
    unwrap<StoreRequest>(apiClient.post(`/platform/store-requests/${id}/approve`, payload)),

  rejectStoreRequest: (id: string, reason: string) =>
    unwrap<StoreRequest>(apiClient.post(`/platform/store-requests/${id}/reject`, { reason })),

  discardStoreRequest: (id: string) =>
    unwrap<StoreRequest>(apiClient.post(`/platform/store-requests/${id}/discard`, {})),

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
