import { SystemRole } from '@prisma/client';

/**
 * Permission strings follow `resource.action`. Keep them additive — code
 * checks for a specific permission, never for a role, so that a tenant owner
 * can hand out narrow slices of access to staff.
 */
export const PERMISSIONS = {
  PRODUCTS_READ: 'products.read',
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_DELETE: 'products.delete',

  CATEGORIES_READ: 'categories.read',
  CATEGORIES_WRITE: 'categories.write',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_ADJUST: 'inventory.adjust',

  ORDERS_READ: 'orders.read',
  ORDERS_UPDATE: 'orders.update',
  ORDERS_REFUND: 'orders.refund',

  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_UPDATE: 'customers.update',

  COUPONS_READ: 'coupons.read',
  COUPONS_WRITE: 'coupons.write',

  REVIEWS_MODERATE: 'reviews.moderate',

  SHIPPING_READ: 'shipping.read',
  SHIPPING_WRITE: 'shipping.write',

  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',

  THEME_UPDATE: 'theme.update',
  PAGES_WRITE: 'pages.write',

  /**
   * Connecting the store's own payment gateway. Separate from SETTINGS_UPDATE
   * because this one hands over credentials that move money into a bank
   * account — the narrowest possible grant is the right default, and STAFF must
   * never inherit it.
   */
  PAYMENTS_MANAGE: 'payments.manage',

  /**
   * One permission for all uploads rather than one per feature. Product images,
   * logos and banners all end up in the same bucket under the same tenant
   * prefix, so splitting the grant would suggest an isolation that does not
   * exist. STAFF does not get it: staff read the catalogue, they do not put
   * files on the store's own origin.
   */
  MEDIA_UPLOAD: 'media.upload',

  STAFF_READ: 'staff.read',
  STAFF_MANAGE: 'staff.manage',

  ANALYTICS_READ: 'analytics.read',

  // Platform-only. Never grantable to a tenant membership.
  PLATFORM_TENANTS_MANAGE: 'platform.tenants.manage',
  PLATFORM_PLANS_MANAGE: 'platform.plans.manage',
  PLATFORM_TEMPLATES_MANAGE: 'platform.templates.manage',
  PLATFORM_ANALYTICS_READ: 'platform.analytics.read',
  PLATFORM_AUDIT_READ: 'platform.audit.read',
  PLATFORM_SETTINGS_MANAGE: 'platform.settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_TENANT_PERMISSIONS: Permission[] = Object.values(PERMISSIONS).filter(
  (p) => !p.startsWith('platform.'),
) as Permission[];

const ALL_PLATFORM_PERMISSIONS: Permission[] = Object.values(PERMISSIONS).filter(
  (p) => p.startsWith('platform.'),
) as Permission[];

/**
 * Default grants per role. A TenantUser row may narrow or extend these via its
 * `permissions` array; the effective set is computed in AuthService.
 */
export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  SUPER_ADMIN: [...ALL_PLATFORM_PERMISSIONS, ...ALL_TENANT_PERMISSIONS],
  TENANT_OWNER: ALL_TENANT_PERMISSIONS,
  TENANT_ADMIN: ALL_TENANT_PERMISSIONS.filter(
    (p) =>
      p !== PERMISSIONS.STAFF_MANAGE &&
      p !== PERMISSIONS.ORDERS_REFUND &&
      // Gateway credentials decide which bank account the money reaches, which
      // is the owner's decision rather than an administrator's.
      p !== PERMISSIONS.PAYMENTS_MANAGE,
  ),
  STAFF: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.CATEGORIES_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.SHIPPING_READ,
  ],
  CUSTOMER: [],
};

export function resolvePermissions(
  role: SystemRole,
  overrides: string[] = [],
): string[] {
  const base = new Set<string>(ROLE_PERMISSIONS[role] ?? []);
  for (const entry of overrides) {
    if (entry.startsWith('-')) base.delete(entry.slice(1));
    else base.add(entry);
  }
  // Platform permissions are never grantable through a tenant membership.
  if (role !== SystemRole.SUPER_ADMIN) {
    for (const p of ALL_PLATFORM_PERMISSIONS) base.delete(p);
  }
  return [...base];
}
