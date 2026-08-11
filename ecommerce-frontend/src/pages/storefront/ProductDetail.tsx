import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productService } from '@/services/store.service';
import { useStore } from '@/features/theme/ThemeProvider';
import { useAddToCart } from '@/hooks/useCart';
import { ProductReviews } from '@/components/ProductReviews';
import { formatMoney } from '@/utils/format';

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const store = useStore();
  const navigate = useNavigate();
  const addToCart = useAddToCart();
  const [added, setAdded] = useState(false);

  const { data: product, isLoading, isError, error } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => productService.getBySlug(slug!),
    enabled: Boolean(slug),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-card bg-ink-100" />
          <div className="space-y-4">
            <div className="h-8 w-2/3 animate-pulse rounded bg-ink-100" />
            <div className="h-6 w-1/4 animate-pulse rounded bg-ink-100" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !product) {
    const gone = (error as { code?: string })?.code === 'PRODUCT_NOT_FOUND';
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-xl text-ink-950">
          {gone ? 'This product is no longer available' : 'Something went wrong'}
        </h1>
        <Link to="/shop" className="mt-4 inline-block text-sm font-medium text-brand">
          Browse the shop
        </Link>
      </div>
    );
  }

  const inStock = product.stock > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="grid gap-10 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-card bg-ink-50">
          {product.images[0] ? (
            <img
              src={product.images[0].url}
              alt={product.images[0].altText ?? product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink-300">
              No image
            </div>
          )}
        </div>

        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink-950">{product.name}</h1>

          <p className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-medium text-ink-950">
              {formatMoney(product.price, store.currency)}
            </span>
            {product.compareAtPrice && (
              <span className="text-base text-ink-300 line-through">
                {formatMoney(product.compareAtPrice, store.currency)}
              </span>
            )}
          </p>

          {product.shortDescription && (
            <p className="mt-5 text-sm leading-relaxed text-ink-700">{product.shortDescription}</p>
          )}

          <p className={`mt-5 text-sm ${inStock ? 'text-ink-500' : 'text-red-600'}`}>
            {inStock ? `${product.stock} in stock` : 'Out of stock'}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              disabled={!inStock || addToCart.isPending}
              onClick={() =>
                addToCart.mutate(
                  { productId: product.id },
                  { onSuccess: () => setAdded(true) },
                )
              }
              className="w-full rounded-card bg-brand py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-10"
            >
              {!inStock
                ? 'Out of stock'
                : addToCart.isPending
                  ? 'Adding…'
                  : added
                    ? 'Added to cart'
                    : 'Add to cart'}
            </button>

            {added && (
              <button
                onClick={() => navigate('/cart')}
                className="w-full rounded-card border border-ink-900 py-3 text-sm font-medium text-ink-900 sm:w-auto sm:px-6"
              >
                View cart
              </button>
            )}
          </div>

          {/* The server refuses over-stock adds, so show its reason rather than
              a guess made from a possibly stale stock number. */}
          {addToCart.isError && (
            <p className="mt-3 text-sm text-red-600">
              {(addToCart.error as { message?: string }).message ?? 'Could not add that.'}
            </p>
          )}
        </div>
      </div>

      <ProductReviews productId={product.id} />
    </div>
  );
}
