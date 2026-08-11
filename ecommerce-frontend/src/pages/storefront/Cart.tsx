import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCart, useRemoveItem, useSetQuantity } from '@/hooks/useCart';
import { useStore } from '@/features/theme/ThemeProvider';
import { OrderSummary } from '@/components/OrderSummary';
import { CouponField } from '@/components/CouponField';
import { formatMoney } from '@/utils/format';
import type { CartItem } from '@/types/api';

export default function Cart() {
  const store = useStore();
  const navigate = useNavigate();
  const { data: cart, isLoading, isError, refetch } = useCart();

  if (isLoading) {
    return (
      <Shell>
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-24 w-24 animate-pulse rounded-card bg-ink-100" />
              <div className="flex-1 space-y-2 py-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-ink-100" />
                <div className="h-4 w-1/5 animate-pulse rounded bg-ink-100" />
              </div>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <div className="rounded-card border border-ink-100 p-10 text-center">
          <p className="text-sm text-ink-700">Your cart couldn't be loaded.</p>
          <button onClick={() => refetch()} className="mt-3 text-sm font-medium text-brand">
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <Shell>
        <div className="rounded-card border border-dashed border-ink-300 p-16 text-center">
          <p className="font-display text-lg text-ink-950">Your cart is empty</p>
          <p className="mt-2 text-sm text-ink-500">
            Once you add something it will show up here.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-card bg-brand px-6 py-3 text-sm font-medium text-white"
          >
            Start shopping
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Items the server dropped because they stopped being sellable. Saying so
          is better than a total that quietly changed between visits. */}
      {cart.removedItems.length > 0 && (
        <div className="mb-6 rounded-card bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {cart.removedItems.join(', ')} {cart.removedItems.length === 1 ? 'is' : 'are'} no
          longer available and {cart.removedItems.length === 1 ? 'was' : 'were'} removed.
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-ink-100">
          {cart.items.map((item) => (
            <Line key={item.id} item={item} currency={store.currency} />
          ))}
        </ul>

        <div className="space-y-6">
          <OrderSummary
            totals={cart.totals}
            currency={store.currency}
            couponCode={cart.coupon?.code}
            shippingChosen={false}
          >
            <button
              onClick={() => navigate('/checkout')}
              className="w-full rounded-card bg-brand py-3 text-sm font-medium text-white"
            >
              Checkout
            </button>
          </OrderSummary>

          <CouponField appliedCode={cart.coupon?.code ?? null} serverError={cart.couponError} />
        </div>
      </div>
    </Shell>
  );
}

function Line({ item, currency }: { item: CartItem; currency: string }) {
  const setQuantity = useSetQuantity();
  const removeItem = useRemoveItem();
  const busy = setQuantity.isPending || removeItem.isPending;

  // Null means the product does not track stock, so there is no ceiling.
  const atMax = item.available !== null && item.quantity >= item.available;

  return (
    <li className="flex gap-4 py-6">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-card bg-ink-50">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-ink-300">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink-900">{item.name}</p>
            {item.variantName && (
              <p className="mt-0.5 text-xs text-ink-500">{item.variantName}</p>
            )}
            <p className="mt-0.5 text-xs text-ink-300">{item.sku}</p>
          </div>
          <p className="whitespace-nowrap text-sm font-medium text-ink-950">
            {formatMoney(item.lineSubtotal, currency)}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center rounded-card border border-ink-300">
            <button
              onClick={() => setQuantity.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
              disabled={busy || item.quantity <= 1}
              aria-label="Decrease quantity"
              className="p-2 text-ink-700 disabled:opacity-30"
            >
              <Minus size={14} />
            </button>
            <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
            <button
              onClick={() => setQuantity.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
              disabled={busy || atMax}
              aria-label="Increase quantity"
              className="p-2 text-ink-700 disabled:opacity-30"
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            onClick={() => removeItem.mutate({ itemId: item.id })}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs text-ink-500 hover:text-red-600 disabled:opacity-40"
          >
            <Trash2 size={14} /> Remove
          </button>
        </div>

        {atMax && item.available !== null && (
          <p className="mt-2 text-xs text-amber-700">
            Only {item.available} in stock.
          </p>
        )}
        {setQuantity.isError && (
          <p className="mt-2 text-xs text-red-600">
            {(setQuantity.error as { message?: string }).message}
          </p>
        )}
      </div>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight text-ink-950">Your cart</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}
