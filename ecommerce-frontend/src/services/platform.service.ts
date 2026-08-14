import { apiClient, unwrap } from './api-client';
import type { PaginationMeta } from '@/types/api';

export interface PlatformTenant {
  id: string;
  slug: string;
  businessName: string;
  contactEmail: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  businessCategory: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  store?: { name: string; isPublished: boolean } | null;
  domains?: { hostname: string; isPrimary: boolean }[];
  _count?: { users?: number };
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

  audit: (params: { page?: number; limit?: number; action?: string; tenantId?: string }) =>
    paged<AuditRow>(apiClient.get('/platform/audit', { params })),
};
