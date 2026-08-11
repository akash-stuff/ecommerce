import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartService } from '@/services/cart.service';
import type { Cart } from '@/types/api';

export const CART_KEY = ['cart'] as const;

/**
 * One cache entry for the cart, shared by the header badge, the cart page and
 * checkout. Every mutation returns the whole recomputed cart, so the server's
 * totals replace the cache rather than the client patching its own copy — which
 * is what keeps the displayed total honest.
 */
export function useCart() {
  return useQuery({
    queryKey: CART_KEY,
    queryFn: cartService.get,
    staleTime: 10_000,
  });
}

function useCartMutation<TArgs>(fn: (args: TArgs) => Promise<Cart>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart) => queryClient.setQueryData(CART_KEY, cart),
  });
}

export const useAddToCart = () =>
  useCartMutation((args: { productId: string; quantity?: number; variantId?: string }) =>
    cartService.addItem(args.productId, args.quantity ?? 1, args.variantId),
  );

export const useSetQuantity = () =>
  useCartMutation((args: { itemId: string; quantity: number }) =>
    cartService.setQuantity(args.itemId, args.quantity),
  );

export const useRemoveItem = () =>
  useCartMutation((args: { itemId: string }) => cartService.removeItem(args.itemId));

export const useApplyCoupon = () =>
  useCartMutation((args: { code: string }) => cartService.applyCoupon(args.code));

export const useRemoveCoupon = () => useCartMutation(() => cartService.removeCoupon());
