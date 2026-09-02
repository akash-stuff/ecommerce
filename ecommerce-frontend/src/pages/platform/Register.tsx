import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { Lockup } from '@/features/platform/brand';
import { env } from '@/config/env';
import { registerService } from '@/services/platform.service';

/**
 * Applying for a store.
 *
 * Not a sign-up. Nothing here creates an account or a shop: provisioning a
 * tenant mints a hostname, a theme, a domain and an owner account and puts a
 * storefront on the public internet, so a person at the platform decides it.
 * The page says so in as many words, because a form that looks like a sign-up
 * and behaves like an application is a form that generates "where is my store"
 * an hour later.
 *
 * The password is chosen here and hashed the moment it arrives. That is the
 * whole reason it is on this form: the alternative is issuing one at approval
 * and reading it out to somebody, and nothing in this codebase emails a
 * password.
 */

/** Mirrors CreateStoreRequestDto's MinLength(10). */
const MIN_PASSWORD = 10;

const blank = {
  businessName: '',
  slug: '',
  businessCategory: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  message: '',
  honeypot: '',
};

/** The same shape the API enforces, so the button is not a dead end. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

export default function Register() {
  const [form, setForm] = useState(blank);
  const [showPassword, setShowPassword] = useState(false);

  const apply = useMutation({
    mutationFn: () =>
      registerService.apply({
        businessName: form.businessName.trim(),
        slug: form.slug.trim(),
        businessCategory: form.businessCategory.trim() || undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        message: form.message.trim() || undefined,
        honeypot: form.honeypot,
      }),
  });

  const set = (field: keyof typeof blank) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const ready =
    form.businessName.trim().length >= 2 &&
    SLUG.test(form.slug.trim()) &&
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    /.+@.+\..+/.test(form.email.trim()) &&
    form.password.length >= MIN_PASSWORD;

  const error = apply.error as { message?: string; details?: string[] } | null;

  return (
    <div className="min-h-screen bg-leaf-wash">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/" aria-label="Everystore, back to the front page">
          <Lockup tagline />
        </Link>
        <Link
          to="/login"
          className="rounded-full border border-ink-200 bg-white/80 px-4 py-2 text-sm font-medium text-ink-800 shadow-card backdrop-blur transition-colors hover:border-leaf-400 hover:text-leaf-700"
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-24 sm:px-8">
        {apply.isSuccess ? (
          <section className="rounded-3xl border border-leaf-200 bg-white p-8 shadow-lifted sm:p-10">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-leaf-600 text-white shadow-glow-leaf">
              <Check size={22} strokeWidth={2.5} />
            </span>
            <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-ink-950">
              We have your application
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Thank you. We have emailed{' '}
              <strong className="font-medium text-ink-950">{form.email.trim()}</strong> to confirm
              it arrived.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-600">
              A person reads every one of these. If it is approved you will get a second email with
              your store address and a link to sign in — with the password you just chose, which we
              do not send by email and cannot read.
            </p>
            <p className="mt-6 rounded-xl bg-leaf-50 px-4 py-3 text-sm text-ink-700">
              You asked for <strong className="font-medium text-ink-950">{form.slug.trim()}</strong>
              . Nothing is reserved until it is approved.
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex items-center gap-1.5 text-sm text-leaf-700 underline underline-offset-2 hover:text-ink-950"
            >
              <ArrowLeft size={14} />
              Back to everystore
            </Link>
          </section>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">
              Apply for a store
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-600 sm:text-base">
              Tell us about the shop you want to run. A person reads every application — this is
              not an instant sign-up, and nothing is created until it is approved.
            </p>

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && !apply.isPending) apply.mutate();
              }}
              className="relative mt-10 rounded-3xl border border-ink-100 bg-white p-6 shadow-lifted sm:p-8"
            >
              <fieldset className="border-0 p-0">
                <legend className="font-display text-base font-semibold text-ink-950">
                  The shop
                </legend>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Business name" required className="sm:col-span-2">
                    <Input
                      value={form.businessName}
                      onChange={(v) => {
                        // Suggested, not forced. The address is the one thing
                        // that can never be changed once the store exists.
                        setForm((c) => ({
                          ...c,
                          businessName: v,
                          slug: c.slug || slugify(v),
                        }));
                      }}
                    />
                  </Field>

                  <Field
                    label="Store address"
                    required
                    hint={`Becomes ${form.slug.trim() || 'yourshop'}.${env.platformDomain} — permanent`}
                    className="sm:col-span-2"
                  >
                    <Input value={form.slug} onChange={(v) => set('slug')(slugify(v))} mono />
                  </Field>

                  <Field label="What you sell" hint="Fashion, groceries, electronics…">
                    <Input
                      value={form.businessCategory}
                      onChange={set('businessCategory')}
                    />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="mt-9 border-0 p-0">
                <legend className="font-display text-base font-semibold text-ink-950">You</legend>
                <p className="mt-1 text-xs text-ink-500">
                  You will be the store&apos;s owner, and sign in with these.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="First name" required>
                    <Input value={form.firstName} onChange={set('firstName')} />
                  </Field>
                  <Field label="Last name" required>
                    <Input value={form.lastName} onChange={set('lastName')} />
                  </Field>
                  <Field label="Email" required hint="You will sign in with this">
                    <Input type="email" value={form.email} onChange={set('email')} />
                  </Field>
                  <Field label="Mobile">
                    <Input type="tel" value={form.phone} onChange={set('phone')} />
                  </Field>

                  <Field
                    label="Password"
                    required
                    hint={`At least ${MIN_PASSWORD} characters. We never email it and cannot read it.`}
                    className="sm:col-span-2"
                  >
                    <span className="relative block">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={set('password')}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 transition-colors hover:text-ink-700"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </Field>
                </div>
              </fieldset>

              <div className="mt-9">
                <Field label="Anything else we should know?">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={form.message}
                    onChange={(e) => set('message')(e.target.value)}
                    placeholder="How many shops you run now, what you sell, what you are moving away from."
                    className="field-leaf w-full resize-y rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400"
                  />
                </Field>
              </div>

              {/* Not a field. Off-screen rather than `display:none`, which some
                  form fillers skip — and out of the tab order and the
                  accessibility tree entirely. */}
              <div className="absolute -left-[9999px] top-0" aria-hidden="true">
                <label>
                  Leave this empty
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.honeypot}
                    onChange={(e) => set('honeypot')(e.target.value)}
                  />
                </label>
              </div>

              {apply.isError && (
                <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error?.message ?? 'Something went wrong. Please try again.'}
                  {error?.details?.length ? ` ${error.details.join(' · ')}` : ''}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={!ready || apply.isPending}
                  className="cta-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-600 focus-visible:ring-offset-2"
                >
                  {apply.isPending ? 'Sending…' : 'Send application'}
                  {!apply.isPending && <ArrowRight size={15} />}
                </button>
                <p className="text-xs text-ink-500">
                  Already have a store?{' '}
                  <Link to="/login" className="text-leaf-700 underline underline-offset-2">
                    Sign in
                  </Link>
                </p>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  required = false,
  className = '',
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-ink-700">
        {label} {required && <span className="text-leaf-600">*</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = 'text',
  mono = false,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  mono?: boolean;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      autoComplete={autoComplete}
      onChange={(e) => onChange(e.target.value)}
      className={`field-leaf w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 ${
        mono ? 'font-mono' : ''
      }`}
    />
  );
}
