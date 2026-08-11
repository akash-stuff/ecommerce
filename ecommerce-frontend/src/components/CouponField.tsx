import { useState } from 'react';
import { X } from 'lucide-react';
import { useApplyCoupon, useRemoveCoupon } from '@/hooks/useCart';

/**
 * Coupon entry. The server decides whether a code is valid and why not, so the
 * refusal it returns is shown verbatim rather than replaced with a generic
 * message — "spend at least ₹1,000" is actionable, "invalid coupon" is not.
 */
export function CouponField({
  appliedCode,
  serverError,
}: {
  appliedCode: string | null;
  /** A stored coupon that stopped being valid while the cart sat idle. */
  serverError: string | null;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = useApplyCoupon();
  const remove = useRemoveCoupon();

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between rounded-card bg-green-50 px-4 py-3 text-sm">
        <span className="text-green-800">
          <span className="font-medium">{appliedCode}</span> applied
        </span>
        <button
          onClick={() => remove.mutate(undefined)}
          disabled={remove.isPending}
          aria-label="Remove coupon"
          className="rounded p-1 text-green-800 hover:bg-green-100"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    apply.mutate(
      { code: code.trim() },
      {
        onSuccess: () => setCode(''),
        onError: (e) => setError((e as { message?: string }).message ?? 'Could not apply that code.'),
      },
    );
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor="coupon" className="text-sm text-ink-700">
        Have a coupon?
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="coupon"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-card border border-ink-300 px-3 py-2 text-sm uppercase placeholder:normal-case focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={apply.isPending || !code.trim()}
          className="rounded-card border border-ink-900 px-4 py-2 text-sm font-medium text-ink-900 disabled:opacity-40"
        >
          {apply.isPending ? 'Applying…' : 'Apply'}
        </button>
      </div>

      {(error ?? serverError) && (
        <p className="mt-2 text-sm text-red-600">{error ?? serverError}</p>
      )}
    </form>
  );
}
