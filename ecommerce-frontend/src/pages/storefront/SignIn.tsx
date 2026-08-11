import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCustomerStore } from '@/store/customer.store';
import { useStore } from '@/features/theme/ThemeProvider';

/**
 * Customer sign-in and registration on one screen.
 *
 * The account is tenant-scoped: registering here creates an account at *this*
 * store only, which the copy says plainly so a shopper is not surprised when
 * their credentials do not work at a different store on the same platform.
 */
export default function SignIn() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = params.get('next') ?? '/account';

  const { signIn, register, status } = useCustomerStore();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  const busy = status === 'loading';
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(form.email, form.password);
      } else {
        await register({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName || undefined,
          phone: form.phone || undefined,
        });
      }
      navigate(redirectTo, { replace: true });
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Something went wrong.');
    }
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight text-ink-950">
        {mode === 'signin' ? 'Sign in' : 'Create an account'}
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        {mode === 'signin'
          ? `Your ${store.name} account.`
          : `This creates an account at ${store.name}.`}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        {mode === 'register' && (
          <>
            <Field label="First name">
              <input required autoComplete="given-name" {...field('firstName')} className={input} />
            </Field>
            <Field label="Last name (optional)">
              <input autoComplete="family-name" {...field('lastName')} className={input} />
            </Field>
          </>
        )}

        <Field label="Email">
          <input required type="email" autoComplete="email" {...field('email')} className={input} />
        </Field>

        <Field label="Password">
          <input
            required
            type="password"
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            {...field('password')}
            className={input}
          />
        </Field>

        {mode === 'register' && (
          <Field label="Phone (optional)">
            <input type="tel" autoComplete="tel" {...field('phone')} className={input} />
          </Field>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-card bg-brand py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-500">
        {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'register' : 'signin');
            setError(null);
          }}
          className="font-medium text-brand"
        >
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </button>
      </p>

      <p className="mt-8 text-xs text-ink-500">
        Shopping without an account works too — <Link to="/cart" className="underline">your cart</Link>{' '}
        is kept either way.
      </p>
    </div>
  );
}

const input =
  'mt-1.5 w-full rounded-card border border-ink-300 px-3 py-2 text-sm focus:border-brand focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-ink-700">{label}</span>
      {children}
    </label>
  );
}
