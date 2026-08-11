import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { cartService, checkoutService } from '@/services/cart.service';
import { useCart } from '@/hooks/useCart';
import { useStore } from '@/features/theme/ThemeProvider';
import { OrderSummary } from '@/components/OrderSummary';
import { formatMoney } from '@/utils/format';
import type { ShippingOption } from '@/types/api';

/**
 * Mirrors the backend DTO's constraints so the shopper is told about a too-short
 * name here rather than by a 400 from the server. The server still validates —
 * this is a courtesy, not the rule.
 */
const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  fullName: z.string().min(2, 'Enter the full name'),
  phone: z.string().min(5, 'Enter a contact number').max(20),
  line1: z.string().min(3, 'Enter the street address'),
  line2: z.string().optional(),
  city: z.string().min(2, 'Enter the city'),
  state: z.string().min(2, 'Enter the state'),
  country: z.string().length(2, 'Use a 2-letter country code'),
  postalCode: z.string().min(3, 'Enter the postal code').max(12),
  notes: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function Checkout() {
  const store = useStore();
  const navigate = useNavigate();
  const { data: baseCart } = useCart();

  const [methodId, setMethodId] = useState<string | null>(null);
  const [isCod, setIsCod] = useState(true);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { country: 'IN' },
    mode: 'onBlur',
  });

  const { country, state, postalCode } = form.watch();
  const destinationReady = country?.length === 2 && Boolean(state) && Boolean(postalCode);

  /**
   * Rates depend on the address, so they are fetched once it is complete enough
   * to place a zone — not on every keystroke.
   */
  const options = useQuery({
    queryKey: ['shipping-options', country, state, postalCode],
    queryFn: () => cartService.shippingOptions({ country, state, postalCode }),
    enabled: destinationReady && (baseCart?.itemCount ?? 0) > 0,
  });

  // Default to the cheapest rate, which is what the sorted list leads with.
  useEffect(() => {
    if (options.data && options.data.length > 0 && !methodId) {
      setMethodId(options.data[0].methodId);
    }
  }, [options.data, methodId]);

  const chosen = options.data?.find((o) => o.methodId === methodId) ?? null;

  useEffect(() => {
    if (chosen && !chosen.codAvailable) setIsCod(false);
  }, [chosen]);

  /**
   * Re-prices the cart on the server whenever the shipping choice changes, so
   * the total on the button is the total that will be charged.
   */
  const priced = useQuery({
    queryKey: ['cart', 'priced', methodId, isCod],
    queryFn: () => cartService.getPriced(methodId, isCod),
    enabled: Boolean(baseCart && baseCart.itemCount > 0),
  });

  const cart = priced.data ?? baseCart;

  const place = useMutation({
    mutationFn: (values: FormValues) =>
      checkoutService.place({
        email: values.email,
        phone: values.phone,
        shippingAddress: {
          fullName: values.fullName,
          phone: values.phone,
          line1: values.line1,
          line2: values.line2 || undefined,
          city: values.city,
          state: values.state,
          country: values.country.toUpperCase(),
          postalCode: values.postalCode,
        },
        shippingMethodId: methodId ?? undefined,
        paymentMethod: isCod ? 'COD' : 'ONLINE',
        notes: values.notes || undefined,
      }),
    onSuccess: (order) => navigate(`/order/${order.orderNumber}`, { state: { order } }),
    onError: (e) =>
      setPlaceError((e as { message?: string }).message ?? 'Could not place the order.'),
  });

  if (baseCart && baseCart.itemCount === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-xl text-ink-950">There is nothing to check out</h1>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand">
          Back to the shop
        </Link>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    setPlaceError(null);
    place.mutate(values);
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight text-ink-950">Checkout</h1>

      <form onSubmit={submit} className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-10">
          <Section title="Contact">
            <Field label="Email" error={form.formState.errors.email?.message}>
              <input
                type="email"
                autoComplete="email"
                {...form.register('email')}
                className={inputClass}
              />
            </Field>
            <Field label="Phone" error={form.formState.errors.phone?.message}>
              <input type="tel" autoComplete="tel" {...form.register('phone')} className={inputClass} />
            </Field>
          </Section>

          <Section title="Delivery address">
            <Field label="Full name" error={form.formState.errors.fullName?.message}>
              <input autoComplete="name" {...form.register('fullName')} className={inputClass} />
            </Field>
            <Field label="Address" error={form.formState.errors.line1?.message} wide>
              <input
                autoComplete="address-line1"
                {...form.register('line1')}
                className={inputClass}
              />
            </Field>
            <Field label="Apartment, suite (optional)" wide>
              <input
                autoComplete="address-line2"
                {...form.register('line2')}
                className={inputClass}
              />
            </Field>
            <Field label="City" error={form.formState.errors.city?.message}>
              <input
                autoComplete="address-level2"
                {...form.register('city')}
                className={inputClass}
              />
            </Field>
            <Field label="State" error={form.formState.errors.state?.message}>
              <input
                autoComplete="address-level1"
                {...form.register('state')}
                className={inputClass}
              />
            </Field>
            <Field label="Postal code" error={form.formState.errors.postalCode?.message}>
              <input
                autoComplete="postal-code"
                {...form.register('postalCode')}
                className={inputClass}
              />
            </Field>
            <Field label="Country" error={form.formState.errors.country?.message}>
              <input
                autoComplete="country"
                maxLength={2}
                {...form.register('country')}
                className={`${inputClass} uppercase`}
              />
            </Field>
          </Section>

          <Section title="Delivery method">
            {!destinationReady && (
              <p className="text-sm text-ink-500 sm:col-span-2">
                Fill in the address above to see delivery options.
              </p>
            )}

            {destinationReady && options.isLoading && (
              <p className="text-sm text-ink-500 sm:col-span-2">Checking delivery options…</p>
            )}

            {destinationReady && options.data?.length === 0 && (
              <p className="text-sm text-red-600 sm:col-span-2">
                This store does not deliver to that address yet.
              </p>
            )}

            <div className="space-y-3 sm:col-span-2">
              {options.data?.map((option) => (
                <MethodRow
                  key={option.methodId}
                  option={option}
                  currency={store.currency}
                  selected={option.methodId === methodId}
                  onSelect={() => setMethodId(option.methodId)}
                />
              ))}
            </div>
          </Section>

          <Section title="Payment">
            <div className="space-y-3 sm:col-span-2">
              <PaymentRow
                label="Cash on delivery"
                hint={
                  chosen?.codAvailable === false
                    ? 'Not available for the selected delivery method'
                    : chosen && Number(chosen.codFee) > 0
                      ? `Includes a ${formatMoney(chosen.codFee, store.currency)} handling fee`
                      : 'Pay when it arrives'
                }
                selected={isCod}
                disabled={chosen?.codAvailable === false}
                onSelect={() => setIsCod(true)}
              />
              {/* Card and UPI appear here once a gateway is configured; offering
                  them without one would be a button that cannot work. */}
              <PaymentRow
                label="Pay online"
                hint="Not configured for this store yet"
                selected={!isCod}
                disabled
                onSelect={() => setIsCod(false)}
              />
            </div>
          </Section>

          <Section title="Order notes">
            <Field label="Anything we should know? (optional)" wide>
              <textarea rows={3} {...form.register('notes')} className={inputClass} />
            </Field>
          </Section>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          {cart && (
            <OrderSummary
              totals={cart.totals}
              currency={store.currency}
              couponCode={cart.coupon?.code}
              shippingChosen={Boolean(methodId)}
            >
              <button
                type="submit"
                disabled={place.isPending || (destinationReady && options.data?.length === 0)}
                className="w-full rounded-card bg-brand py-3 text-sm font-medium text-white disabled:opacity-40"
              >
                {place.isPending
                  ? 'Placing order…'
                  : `Place order · ${formatMoney(cart.totals.grandTotal, store.currency)}`}
              </button>

              {placeError && <p className="mt-3 text-sm text-red-600">{placeError}</p>}

              <p className="mt-4 text-xs text-ink-500">
                {cart.items.length} {cart.items.length === 1 ? 'item' : 'items'} · prices confirmed
                by the store at checkout
              </p>
            </OrderSummary>
          )}
        </div>
      </form>
    </div>
  );
}

const inputClass =
  'mt-1.5 w-full rounded-card border border-ink-300 px-3 py-2 text-sm focus:border-brand focus:outline-none';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-base text-ink-950">{title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  wide,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-ink-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function MethodRow({
  option,
  currency,
  selected,
  onSelect,
}: {
  option: ShippingOption;
  currency: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const days =
    option.minDeliveryDays && option.maxDeliveryDays
      ? `${option.minDeliveryDays}–${option.maxDeliveryDays} days`
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-card border px-4 py-3 text-left text-sm ${
        selected ? 'border-brand bg-brand/5' : 'border-ink-300'
      }`}
    >
      <span>
        <span className="text-ink-900">{option.name}</span>
        {days && <span className="ml-2 text-xs text-ink-500">{days}</span>}
      </span>
      <span className="font-medium text-ink-950">
        {Number(option.amount) === 0 ? 'Free' : formatMoney(option.amount, currency)}
      </span>
    </button>
  );
}

function PaymentRow({
  label,
  hint,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full flex-col items-start rounded-card border px-4 py-3 text-left text-sm disabled:opacity-50 ${
        selected && !disabled ? 'border-brand bg-brand/5' : 'border-ink-300'
      }`}
    >
      <span className="text-ink-900">{label}</span>
      <span className="mt-0.5 text-xs text-ink-500">{hint}</span>
    </button>
  );
}
