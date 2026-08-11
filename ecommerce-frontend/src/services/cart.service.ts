import { apiClient, unwrap } from './api-client';
import type { Cart, Order, OrderAddress, ShippingOption } from '@/types/api';

/**
 * The guest cart token.
 *
 * It is stored per store, keyed by hostname: one browser may shop at two
 * tenants on the same platform, and a token from one is meaningless at the
 * other. Sharing a single key would silently show an empty cart every time the
 * shopper switched stores.
 */
const tokenKey = (): string => `cart_token:${window.location.hostname}`;

export function getCartToken(): string | null {
  return localStorage.getItem(tokenKey());
}

export function setCartToken(token: string | null): void {
  if (token) localStorage.setItem(tokenKey(), token);
  else localStorage.removeItem(tokenKey());
}

/** Sent on every cart call; the server ignores it for signed-in customers. */
function cartHeaders(): Record<string, string> {
  const token = getCartToken();
  return token ? { 'x-cart-token': token } : {};
}

/**
 * The server hands back a token the first time a guest cart is created, so
 * every response is a chance to learn it. Once a customer signs in the server
 * returns null and the stored token is dropped.
 */
function remember(cart: Cart): Cart {
  if (cart.cartToken) setCartToken(cart.cartToken);
  return cart;
}

export interface CheckoutPayload {
  email: string;
  phone?: string;
  shippingAddress: OrderAddress;
  billingAddress?: OrderAddress;
  shippingMethodId?: string;
  paymentMethod: 'COD' | 'ONLINE';
  notes?: string;
}

export const cartService = {
  get: () =>
    unwrap<Cart>(apiClient.get('/cart', { headers: cartHeaders() })).then(remember),

  /**
   * The cart priced for a chosen delivery method. The shipping and COD amounts
   * are computed server-side so the total shown at checkout is the total
   * charged — the browser never adds up money itself.
   */
  getPriced: (shippingMethodId: string | null, cod: boolean) =>
    unwrap<Cart>(
      apiClient.get('/cart', {
        headers: cartHeaders(),
        params: {
          ...(shippingMethodId ? { shippingMethodId } : {}),
          ...(cod ? { cod: true } : {}),
        },
      }),
    ).then(remember),

  addItem: (productId: string, quantity = 1, variantId?: string) =>
    unwrap<Cart>(
      apiClient.post('/cart/items', { productId, quantity, variantId }, { headers: cartHeaders() }),
    ).then(remember),

  setQuantity: (itemId: string, quantity: number) =>
    unwrap<Cart>(
      apiClient.patch(`/cart/items/${itemId}`, { quantity }, { headers: cartHeaders() }),
    ).then(remember),

  removeItem: (itemId: string) =>
    unwrap<Cart>(apiClient.delete(`/cart/items/${itemId}`, { headers: cartHeaders() })).then(
      remember,
    ),

  applyCoupon: (code: string) =>
    unwrap<Cart>(apiClient.post('/cart/coupon', { code }, { headers: cartHeaders() })).then(
      remember,
    ),

  removeCoupon: () =>
    unwrap<Cart>(apiClient.delete('/cart/coupon', { headers: cartHeaders() })).then(remember),

  shippingOptions: (destination: { country: string; state?: string; postalCode?: string }) =>
    unwrap<ShippingOption[]>(
      apiClient.post('/cart/shipping-options', destination, { headers: cartHeaders() }),
    ),

  /** Called after sign-in so the guest's cart is not silently abandoned. */
  merge: () =>
    unwrap<Cart>(apiClient.post('/cart/merge', {}, { headers: cartHeaders() })).then((cart) => {
      setCartToken(null); // the customer's cart is theirs; the guest token is spent
      return cart;
    }),
};

export const checkoutService = {
  /**
   * Places the order. The payload carries no prices — the server recomputes the
   * total from the catalogue, and the response is the authoritative figure.
   */
  place: (payload: CheckoutPayload) =>
    unwrap<Order>(apiClient.post('/checkout', payload, { headers: cartHeaders() })).then(
      (order) => {
        // The cart is gone server-side; drop the token so the next visit starts clean.
        setCartToken(null);
        return order;
      },
    ),

  paymentProviders: () =>
    unwrap<{ providers: string[] }>(apiClient.get('/payments/providers')),
};
