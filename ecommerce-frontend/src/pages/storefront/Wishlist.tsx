import { Link, Navigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useWishlist, useToggleWishlist, type WishlistEntry } from '@/hooks/useWishlist';
import { useAddToCart } from '@/hooks/useCart';
import { useCustomerStore } from '@/store/customer.store';
import { useStore } from '@/features/theme/ThemeProvider';
import { formatMoney } from '@/utils/format';

export default function Wishlist() {
  const store = useStore();
  const { customer, status } = useCustomerStore();
  const { data, isLoading, isError, refetch } = useWishlist();

  if (status === 'idle' || status === 'loading') {
    return <div className="mx-auto max-w-4xl px-4 py-16 text-sm text-ink-500">Loading…</div>;
  }

  if (status === 'guest' || !customer) {
    return <Navigate to="/account/sign-in?next=/wishlist" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight text-ink-950">Saved items</h1>

      {isLoading && <p className="mt-6 text-sm text-ink-500">Loading…</p>}

      {isError && (
        <div className="mt-6 rounded-card border border-ink-100 p-8 text-center">
          <p className="text-sm text-ink-700">Your saved items couldn't be loaded.</p>
          <button onClick={() => refetch()} className="mt-3 text-sm font-medium text-brand">
            Try again
          </button>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="mt-6 rounded-card border border-dashed border-ink-300 p-16 text-center">
          <p className="text-sm text-ink-700">Nothing saved yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Tap Save on a product to keep it here for later.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-block rounded-card bg-brand px-6 py-3 text-sm font-medium text-white"
          >
            Browse the shop
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="mt-8 divide-y divide-ink-100">
          {data.map((entry) => (
            <Item key={entry.id} entry={entry} currency={store.currency} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({ entry, currency }: { entry: WishlistEntry; currency: string }) {
  const product = entry.product;
  const remove = useToggleWishlist(product.id);
  const addToCart = useAddToCart();

  return (
    <li className="flex gap-4 py-6">
      <Link to={`/product/${product.slug}`} className="h-24 w-24 shrink-0">
        <div className="h-full w-full overflow-hidden rounded-card bg-ink-50">
          {product.images[0] ? (
            <img
              src={product.images[0].url}
              alt={product.images[0].altText ?? product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-ink-300">
              No image
            </div>
          )}
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-4">
          <Link to={`/product/${product.slug}`} className="min-w-0">
            <p className="truncate text-sm text-ink-900 hover:text-brand">{product.name}</p>
          </Link>
          <p className="whitespace-nowrap text-sm font-medium text-ink-950">
            {formatMoney(product.price, currency)}
          </p>
        </div>

        {!product.inStock && <p className="mt-1 text-xs text-red-600">Out of stock</p>}

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => addToCart.mutate({ productId: product.id })}
            disabled={!product.inStock || addToCart.isPending}
            className="rounded-card bg-brand px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            {addToCart.isPending ? 'Adding…' : 'Add to cart'}
          </button>

          <button
            onClick={() => remove.mutate(true)}
            disabled={remove.isPending}
            className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-red-600 disabled:opacity-40"
          >
            <Trash2 size={14} /> Remove
          </button>
        </div>

        {addToCart.isError && (
          <p className="mt-2 text-xs text-red-600">
            {(addToCart.error as { message?: string }).message}
          </p>
        )}
      </div>
    </li>
  );
}
