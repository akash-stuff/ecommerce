export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  message: string;
  code: string;
  details?: string[];
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export type Role = 'SUPER_ADMIN' | 'TENANT_OWNER' | 'TENANT_ADMIN' | 'STAFF' | 'CUSTOMER';

export interface AuthUser {
  // id: string;
  // email: string;
  // firstName: string;
  // lastName: string;
  // role: Role;
  // tenantId: string | null;
  // permissions: string[];
    id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  tenantId: string | null;
  tenantSlug: string | null;
  permissions: string[];
}

export interface StoreTheme {
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  bodyFont: string;
  headingFont: string;
  /** 'sm' | 'md' | 'lg' — the header logo height. */
  logoSize: string;
  /** Named preset; the storefront draws it in this store's colours. */
  background: string;
  /** An uploaded image, which overrides the preset. */
  backgroundImageUrl: string | null;
  /** 'cover' | 'tile' */
  backgroundFit: string;
  /** Artwork beside the shopper sign-in form. Optional. */
  loginImageUrl: string | null;
  /** A short line of the store's own words on that page. Plain text. */
  loginMessage: string | null;
  socialLinks: Record<string, string>;
  homepageLayout: string[];
  /** Sanitised server-side; safe to place in a <style> block. */
  customCss: string | null;
}

export interface EditableTheme {
  id: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  productDescription: string | null;
  isPublished: boolean;
  template: { id: string; slug: string; name: string } | null;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    bodyFont: string;
    headingFont: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    logoSize: string;
    background: string;
    backgroundImageUrl: string | null;
    backgroundFit: string;
    loginImageUrl: string | null;
    loginMessage: string | null;
    socialLinks: Record<string, string>;
    homepageLayout: string[];
    customCss: string | null;
  } | null;
}

export interface StoreConfig {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  email: string;
  phone: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  /**
   * One block the shopkeeper wrote once, shown under every product's own
   * description. Plain text — rendered as words, never as markup.
   */
  productDescription: string | null;
  template: { id: string; slug: string; name: string } | null;
  theme: StoreTheme;
}

/** Every money field arrives as a decimal string so precision survives the wire. */
export interface CartTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  /** Null when the product does not track inventory. */
  available: number | null;
  lineSubtotal: string;
  discount: string;
  tax: string;
  lineTotal: string;
}

export interface Cart {
  cartId: string | null;
  /** Guest cart identifier. Null once a customer owns the cart. */
  cartToken: string | null;
  itemCount: number;
  coupon: { code: string } | null;
  /** Set when a stored coupon stopped being valid while the cart sat idle. */
  couponError: string | null;
  /** Present only when the cart was priced for a specific delivery method. */
  shippingMethod: { id: string; name: string } | null;
  removedItems: string[];
  items: CartItem[];
  totals: CartTotals;
}

export interface ShippingOption {
  methodId: string;
  name: string;
  amount: string;
  codAvailable: boolean;
  codFee: string;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
}

export interface OrderAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface OrderItem {
  id: string;
  productName: string;
  variantName: string | null;
  sku: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  currency: string;
  couponCode: string | null;
  customerEmail: string;
  shippingAddress: OrderAddress;
  items: OrderItem[];
  placedAt: string;
}

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  _count?: { children: number; products: number };
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: string;
  minOrderAmount: string | null;
  maxDiscountAmount: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

export interface ShippingMethod {
  id: string;
  zoneId: string;
  name: string;
  baseRate: string;
  perKgRate: string;
  freeAboveAmount: string | null;
  codAvailable: boolean;
  codFee: string;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
  isActive: boolean;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  states: string[];
  postalCodePrefixes: string[];
  isActive: boolean;
  methods: ShippingMethod[];
}

export interface InventoryTransaction {
  id: string;
  reason: string;
  quantityDelta: number;
  stockAfter: number;
  reference: string | null;
  note: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string } | null;
  variant: { id: string; name: string; sku: string } | null;
}

/** Order as the admin list returns it, with the item count rather than items. */
export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customerEmail: string;
  grandTotal: string;
  currency: string;
  placedAt: string;
  _count: { items: number };
}

export interface AdminOrder extends Order {
  cancelReason: string | null;
  customerPhone: string | null;
  notes: string | null;
  payments: {
    id: string;
    provider: string;
    status: string;
    amount: string;
    capturedAt: string | null;
  }[];
}

export type BannerPlacement = 'HOME_HERO' | 'SITE_ANNOUNCEMENT';

/** What the storefront receives: already filtered to what should be showing. */
export interface Banner {
  id: string;
  title: string | null;
  subtitle: string | null;
  /** Null for a text-only placement such as the announcement strip. */
  imageUrl: string | null;
  linkUrl: string | null;
  placement: BannerPlacement;
  position: number;

  /**
   * Announcement-bar styling. All four are null unless the shopkeeper set them,
   * and null means "the store's brand colour, white text and the body font".
   */
  backgroundColor: string | null;
  textColor: string | null;
  fontFamily: string | null;
  /** 'sm' | 'md' | 'lg' */
  fontSize: string | null;
}

/**
 * The admin view adds the schedule and `isLive` — computed server-side, because
 * "active but not showing" needs the same clock the storefront query used.
 */
export interface AdminBanner extends Banner {
  isActive: boolean;
  isLive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  shortDescription: string | null;
  /** The long copy. Present on the single-product endpoints, absent in lists. */
  description?: string | null;
  stock: number;
  isFeatured: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  ratingAverage: string;
  ratingCount: number;
  images: { id: string; url: string; altText: string | null }[];
  category: { id: string; name: string; slug: string } | null;
}
