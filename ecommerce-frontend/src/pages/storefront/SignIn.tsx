import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { customerService } from '@/services/customer.service';
import { useCustomerStore } from '@/store/customer.store';
import { useStore } from '@/features/theme/ThemeProvider';

type Mode = 'signin' | 'register' | 'verify';

/**
 * Customer sign-in and registration on one screen.
 *
 * The account is tenant-scoped: registering here creates an account at *this*
 * store only, which the copy says plainly so a shopper is not surprised when
 * their credentials do not work at a different store on the same platform.
 *
 * Registration is two steps. The first collects the details and asks the API to
 * email a code; the second confirms it, which is the point at which the account
 * actually exists. Nothing is created in between, so abandoning the form here
 * leaves nothing behind and does not reserve the email address.
 */
export default function SignIn() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = params.get('next') ?? '/account';

  const { signIn, register, verifyEmail, status } = useCustomerStore();
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  const busy = status === 'loading';

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  /**
   * One interval drives both countdowns.
   *
   * They are shown because a code that has silently expired is the worst version
   * of this screen: the shopper retypes a correct code, is told it is wrong, and
   * has no way to know why.
   */
  useEffect(() => {
    if (mode !== 'verify') return;
    const tick = window.setInterval(() => {
      setResendIn((s) => (s > 0 ? s - 1 : 0));
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        await signIn(form.email, form.password);
        navigate(redirectTo, { replace: true });
        return;
      }

      if (mode === 'register') {
        const challenge = await register({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName || undefined,
          phone: form.phone || undefined,
        });
        setExpiresIn(challenge.expiresInSeconds);
        setResendIn(challenge.resendInSeconds);
        setCode('');
        setMode('verify');
        return;
      }

      await verifyEmail(form.email, code);
      navigate(redirectTo, { replace: true });
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Something went wrong.');
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await customerService.resendCode(form.email);
      setNotice('A new code is on its way.');
      setResendIn(60);
      setExpiresIn(10 * 60);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not send another code.');
    }
  };

  if (mode === 'verify') {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
        <h1 className="font-display text-2xl tracking-tight text-ink-950">Check your email</h1>
        <p className="mt-2 text-sm text-ink-500">
          We sent a 6-digit code to <span className="text-ink-900">{form.email}</span>. Enter it to
          finish creating your {store.name} account.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <CodeInput value={code} onChange={setCode} />

          {expiresIn > 0 ? (
            <p className="text-xs text-ink-500">Expires in {formatClock(expiresIn)}</p>
          ) : (
            <p className="text-xs text-amber-700">
              That code has expired — send yourself a new one.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy || code.replace(/\D/g, '').length < 6}
            className="w-full rounded-card bg-brand py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Please wait…' : 'Confirm and create account'}
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <button
            type="button"
            onClick={resend}
            disabled={resendIn > 0}
            className="font-medium text-brand disabled:text-ink-400"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Send another code'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
              setNotice(null);
            }}
            className="text-ink-500 underline"
          >
            Use a different email
          </button>
        </div>

        <p className="mt-8 text-xs text-ink-500">
          Nothing is created until the code is confirmed, so you can close this and start again.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="font-display text-2xl tracking-tight text-ink-950">
        {mode === 'signin' ? 'Sign in' : 'Create an account'}
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        {mode === 'signin'
          ? `Your ${store.name} account.`
          : `This creates an account at ${store.name}. We will email a code to confirm your address.`}
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
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Send verification code'}
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

/**
 * One wide input rather than six boxes.
 *
 * Six separate boxes look the part and fight the platform: paste splits across
 * them unevenly, backspace behaviour has to be reimplemented, and screen readers
 * announce six unlabelled fields. A single field with `one-time-code` lets iOS
 * and Android offer the code from the notification, which is the feature that
 * actually saves typing.
 */
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <label className="block text-sm">
      <span className="text-ink-700">Verification code</span>
      <input
        ref={ref}
        required
        // `text` with a numeric hint, not `number`: a number input strips the
        // leading zero a code can start with, and shows spinner arrows.
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="123456"
        value={value}
        // Digits only, so a pasted "123 456" arrives clean.
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="mt-1.5 w-full rounded-card border border-ink-300 px-3 py-3 text-center text-2xl tracking-[0.4em] focus:border-brand focus:outline-none"
      />
    </label>
  );
}

/** m:ss, because "412 seconds" is not how anyone reads a countdown. */
function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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
