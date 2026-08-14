import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { useCustomerStore } from '@/store/customer.store';

export interface WishlistEntry {
  id: string;
  savedAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    price: string;
    compareAtPrice: string | null;
    stock: number;
    inStock: boolean;
    images: { url: string; altText: string | null }[];
  };
}

export const WISHLIST_KEY = ['wishlist'] as const;

export function useWishlist() {
  const customer = useCustomerStore((s) => s.customer);

  return useQuery({
    queryKey: WISHLIST_KEY,
    queryFn: () => unwrap<WishlistEntry[]>(apiClient.get('/wishlist')),
    // Guests have no wishlist; asking would 403 on every render.
    enabled: Boolean(customer),
  });
}

/**
 * Whether one product is saved.
 *
 * Answered by its own endpoint rather than by scanning the full list, so a
 * product page does not have to load a shopper's entire wishlist to draw one
 * heart. The endpoint is public and returns false for guests.
 */
export function useIsSaved(productId: string) {
  return useQuery({
    queryKey: ['wishlist', productId],
    queryFn: () => unwrap<{ saved: boolean }>(apiClient.get(`/wishlist/${productId}`)),
    staleTime: 30_000,
  });
}

export function useToggleWishlist(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (saved: boolean) =>
      saved
        ? apiClient.delete(`/wishlist/${productId}`)
        : apiClient.post(`/wishlist/${productId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist', productId] });
      queryClient.invalidateQueries({ queryKey: WISHLIST_KEY });
    },
  });
}
