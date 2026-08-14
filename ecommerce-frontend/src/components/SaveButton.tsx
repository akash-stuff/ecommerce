import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useIsSaved, useToggleWishlist } from '@/hooks/useWishlist';
import { useCustomerStore } from '@/store/customer.store';

/**
 * The heart on a product.
 *
 * A guest is sent to sign in rather than shown a button that fails: saving
 * needs an account, and discovering that only after clicking is worse than
 * being told up front.
 */
export function SaveButton({ productId, className = '' }: { productId: string; className?: string }) {
  const navigate = useNavigate();
  const customer = useCustomerStore((s) => s.customer);
  const { data } = useIsSaved(productId);
  const toggle = useToggleWishlist(productId);

  const saved = data?.saved ?? false;

  return (
    <button
      type="button"
      aria-label={saved ? 'Remove from saved items' : 'Save for later'}
      aria-pressed={saved}
      disabled={toggle.isPending}
      onClick={() => {
        if (!customer) {
          navigate(`/account/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        toggle.mutate(saved);
      }}
      className={`flex items-center gap-2 rounded-card border px-4 py-3 text-sm disabled:opacity-40 ${
        saved ? 'border-brand text-brand' : 'border-ink-300 text-ink-700 hover:border-ink-900'
      } ${className}`}
    >
      <Heart size={16} fill={saved ? 'currentColor' : 'none'} />
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
