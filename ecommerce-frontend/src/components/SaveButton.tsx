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
 *
 * ## Why there is a variant rather than a `className`
 *
 * This is used in two places that want genuinely different objects: a labelled
 * pill beside "Add to bag" on the product page, and a bare circular heart
 * floating over the photograph on a card. That was previously done by passing
 * `className`, which does not work — the base classes stay, so `h-9 w-9` fought
 * `px-4 py-3`, `rounded-full` fought `rounded-card`, `grid` fought `flex`, and
 * the word "Save" kept rendering and spilled out of the circle. Tailwind has no
 * precedence between two conflicting utilities in one string; the winner is
 * whichever rule the stylesheet happens to emit last.
 *
 * So the shape is chosen here, and `className` is left for position only.
 */
type Variant = 'button' | 'icon';

const BASE =
  'inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40';

const SHAPES: Record<Variant, string> = {
  /** The labelled pill: product page, beside the primary action. */
  button: 'gap-2 rounded-card border px-4 py-3 text-sm',
  /**
   * The bare heart: floats over a product photograph.
   *
   * `h-9 w-9` with no padding, so the glyph is centred by the flex box rather
   * than pushed off-centre by asymmetric padding. Its own white ground and
   * shadow, because it sits on an unknown photograph and a naked icon is
   * invisible on half of them.
   */
  icon: 'h-9 w-9 rounded-full bg-white/95 shadow-raised backdrop-blur',
};

const TONES: Record<Variant, { on: string; off: string }> = {
  button: {
    on: 'border-brand text-brand',
    off: 'border-ink-300 text-ink-700 hover:border-ink-900',
  },
  icon: {
    on: 'text-brand',
    off: 'text-ink-700 hover:text-brand',
  },
};

export function SaveButton({
  productId,
  variant = 'button',
  className = '',
}: {
  productId: string;
  variant?: Variant;
  className?: string;
}) {
  const navigate = useNavigate();
  const customer = useCustomerStore((s) => s.customer);
  const { data } = useIsSaved(productId);
  const toggle = useToggleWishlist(productId);

  const saved = data?.saved ?? false;
  const label = saved ? 'Remove from saved items' : 'Save for later';

  return (
    <button
      type="button"
      aria-label={label}
      // The icon variant has no visible text, so the tooltip is the only thing
      // a sighted mouse user gets. The labelled one already says it.
      title={variant === 'icon' ? label : undefined}
      aria-pressed={saved}
      disabled={toggle.isPending}
      onClick={() => {
        if (!customer) {
          navigate(`/account/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        toggle.mutate(saved);
      }}
      className={`${BASE} ${SHAPES[variant]} ${saved ? TONES[variant].on : TONES[variant].off} ${className}`}
    >
      <Heart size={16} fill={saved ? 'currentColor' : 'none'} className="shrink-0" />
      {variant === 'button' && (saved ? 'Saved' : 'Save')}
    </button>
  );
}
