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
  /**
   * How a customer reaches the shop. The email is printed in the storefront
   * footer and at the foot of every order email, so it is never null; the rest
   * are optional, and the invoice falls back to them when the invoicing form is
   * left blank.
   */
  email: string;
  phone: string | null;
  /** Null until the shop opts in; the chat button is hidden while it is. */
  whatsappNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
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
    /**
     * The homepage delivery-and-payment strip as the shopkeeper wrote it.
     * Empty means they have written none, and the storefront derives the strip
     * from the store's shipping settings instead.
     */
    promises: StorePromise[];
    customCss: string | null;
  } | null;
}

export interface StoreConfig {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  /** Null when the server withholds it: the stored address is a staff login. */
  email: string | null;
  phone: string | null;
  /**
   * Null until the shop opts in, and the storefront's chat button is hidden
   * while it is. Deliberately not defaulted from `phone`: that is frequently a
   * landline, and a chat button nobody can answer is worse than none.
   */
  whatsappNumber: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  /**
   * One block the shopkeeper wrote once, shown under every product's own
   * description. Plain text — rendered as words, never as markup.
   */
  productDescription: string | null;
  template: { id: string; slug: string; name: string } | null;
  theme: StoreTheme;
  /**
   * What the shop promises a shopper before they have a basket. Optional so a
   * storefront
   * built against an older API still typechecks. An empty array means the shop
   * has nothing true to say and the section draws nothing.
   */
  promises?: StorePromise[];
}

/**
 * One tile of the homepage delivery-and-payment strip, ready to render.
 *
 * Worded server-side either way: the shop writes these in Appearance, and a
 * shop that has written none gets a set derived from its shipping methods. The
 * storefront's only job is to pick an icon for `icon` and print the two lines.
 */
export interface StorePromise {
  /** One of a fixed set; see PROMISE_ICONS on the server. */
  icon: string;
  title: string;
  detail: string;
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

/**
 * A parcel, as a shopper sees it.
 *
 * `provider` is the stored courier code — `courierLabel` turns it into
 * something to show. There is deliberately no `methodId` or `tenantId` here:
 * the API selects only these fields for the customer endpoints.
 */
export interface Shipment {
  id: string;
  /** The stored courier code — the identifier, not what to render. */
  provider: string;
  /**
   * The carrier's name, resolved server-side so the storefront does not keep a
   * second copy of the courier list that can drift from the real one. Optional
   * only so a response from an older API build still typechecks.
   */
  courierName?: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
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
  /** Absent on an order placed before anything was dispatched. */
  shipments?: Shipment[];
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

/**
 * One tile in the storefront's category row.
 *
 * `discount` is the real spread across that category's live products, computed
 * server-side from `compareAtPrice` against `price`. Null when nothing in the
 * category is reduced, which is why the tile falls back to a product count
 * rather than printing a discount nobody is offering.
 */
export interface CategoryTile {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  productCount: number;
  discount: { min: number; max: number } | null;
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
