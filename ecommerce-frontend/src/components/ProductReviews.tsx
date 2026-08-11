import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { useCustomerStore } from '@/store/customer.store';
import type { PaginationMeta } from '@/types/api';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  createdAt: string;
  customer: { firstName: string } | null;
}

interface ReviewPage {
  items: Review[];
  meta: PaginationMeta;
  breakdown: Record<string, number>;
}

export function ProductReviews({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const customer = useCustomerStore((s) => s.customer);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reviews = useQuery({
    queryKey: ['reviews', productId],
    queryFn: () =>
      apiClient.get(`/reviews/product/${productId}`, { params: { limit: 10 } }).then((r) => ({
        items: r.data.data as Review[],
        meta: r.data.meta as PaginationMeta,
        breakdown: r.data.breakdown as Record<string, number>,
      })) as Promise<ReviewPage>,
  });

  const submit = useMutation({
    mutationFn: () =>
      unwrap(
        apiClient.post('/reviews', {
          productId,
          rating,
          title: title || undefined,
          comment: comment || undefined,
        }),
      ),
    onSuccess: () => {
      setSubmitted(true);
      setOpen(false);
      setTitle('');
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['reviews', productId] });
    },
    onError: (e) => setError((e as { message?: string }).message ?? 'Could not post that review.'),
  });

  const total = reviews.data?.meta.total ?? 0;
  const breakdown = reviews.data?.breakdown ?? {};
  const average =
    total > 0
      ? Object.entries(breakdown).reduce((sum, [star, count]) => sum + Number(star) * count, 0) /
        total
      : 0;

  return (
    <section className="mt-16 border-t border-ink-100 pt-10">
      <h2 className="font-display text-xl tracking-tight text-ink-950">Reviews</h2>

      {reviews.isLoading && <p className="mt-4 text-sm text-ink-500">Loading reviews…</p>}

      {reviews.data && total === 0 && (
        <p className="mt-3 text-sm text-ink-500">
          No reviews yet. {customer ? 'Be the first.' : 'Sign in to be the first.'}
        </p>
      )}

      {total > 0 && (
        <div className="mt-5 flex flex-wrap items-start gap-10">
          <div>
            <p className="text-3xl font-medium text-ink-950">{average.toFixed(1)}</p>
            <Stars value={Math.round(average)} />
            <p className="mt-1 text-xs text-ink-500">
              {total} review{total === 1 ? '' : 's'}
            </p>
          </div>

          <div className="min-w-48 flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = breakdown[star] ?? 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-ink-500">{star}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-ink-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reviews are moderated, so say so rather than let the shopper wonder
          why theirs has not appeared. */}
      {submitted && (
        <div className="mt-6 rounded-card bg-green-50 px-4 py-3 text-sm text-green-800">
          Thanks — your review has been sent to the store and will appear once approved.
        </div>
      )}

      <div className="mt-6">
        {!customer ? (
          <Link
            to={`/account/sign-in?next=/product`}
            className="text-sm font-medium text-brand"
          >
            Sign in to write a review
          </Link>
        ) : !open && !submitted ? (
          <button onClick={() => setOpen(true)} className="text-sm font-medium text-brand">
            Write a review
          </button>
        ) : null}
      </div>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submit.mutate();
          }}
          className="mt-4 max-w-lg rounded-card border border-ink-100 p-5"
        >
          <fieldset>
            <legend className="text-sm text-ink-700">Your rating</legend>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  aria-label={`${star} star${star === 1 ? '' : 's'}`}
                  aria-pressed={rating === star}
                  className={`text-2xl leading-none ${
                    star <= rating ? 'text-amber-500' : 'text-ink-300'
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block text-sm">
            <span className="text-ink-700">Title (optional)</span>
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-card border border-ink-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="mt-4 block text-sm">
            <span className="text-ink-700">Your review</span>
            <textarea
              rows={4}
              value={comment}
              maxLength={2000}
              onChange={(e) => setComment(e.target.value)}
              className="mt-1.5 w-full rounded-card border border-ink-300 px-3 py-2 text-sm"
            />
          </label>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={submit.isPending}
              className="rounded-card bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {submit.isPending ? 'Sending…' : 'Post review'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-card border border-ink-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="mt-8 divide-y divide-ink-100">
        {reviews.data?.items.map((review) => (
          <li key={review.id} className="py-5">
            <div className="flex items-center gap-3">
              <Stars value={review.rating} />
              {review.isVerifiedPurchase && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                  Verified purchase
                </span>
              )}
            </div>
            {review.title && (
              <p className="mt-2 text-sm font-medium text-ink-950">{review.title}</p>
            )}
            {review.comment && (
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{review.comment}</p>
            )}
            <p className="mt-2 text-xs text-ink-500">
              {review.customer?.firstName ?? 'A customer'} ·{' '}
              {new Date(review.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="text-sm">
      <span className="text-amber-500" aria-hidden>{'★'.repeat(value)}</span>
      <span className="text-ink-300" aria-hidden>{'★'.repeat(5 - value)}</span>
      <span className="sr-only">{value} out of 5</span>
    </span>
  );
}
