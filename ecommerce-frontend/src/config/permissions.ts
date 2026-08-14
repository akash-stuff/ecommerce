/**
 * Mirror of the backend permission strings. Used only to decide what to render.
 * Keep in sync with ecommerce-backend/src/common/rbac/permissions.ts.
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
  CUSTOMERS_READ: 'customers.read',
  COUPONS_READ: 'coupons.read',
  COUPONS_WRITE: 'coupons.write',
  SHIPPING_READ: 'shipping.read',
  SHIPPING_WRITE: 'shipping.write',
  THEME_UPDATE: 'theme.update',
  PAGES_WRITE: 'pages.write',
  REVIEWS_MODERATE: 'reviews.moderate',
  ANALYTICS_READ: 'analytics.read',
  SETTINGS_READ: 'settings.read',
  SETTINGS_UPDATE: 'settings.update',
  STAFF_MANAGE: 'staff.manage',
} as const;
