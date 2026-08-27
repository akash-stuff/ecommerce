import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { customerService } from '@/services/customer.service';
import { useCustomerStore } from '@/store/customer.store';
import { useStore } from '@/features/theme/ThemeProvider';
import { toast } from '@/components/Toasts';

/**
 * Sign in, register, verify and reset — one screen, four modes.
 *
 * The account is tenant-scoped: registering here creates an account at *this*
 * store only, which the copy says plainly so a shopper is not surprised when
 * their credentials do not work at a different store on the same platform.
 *
 * Registration is two steps. The first collects the details and asks the API to
 * email a code; the second confirms it, which is the point at which the account
 * actually exists. Nothing is created in between, so abandoning the form here
 * leaves nothing behind and does not reserve the email address.
 *
 * Resetting a password has the same shape for the same reason — a code proves
 * the address, and only then does anything change.
 */
type Mode = 'signin' | 'register' | 'verify' | 'forgot' | 'reset';

export default function SignIn() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTo = params.get('next') ?? '/account';

  const { signIn, register, verifyEmail, resetPassword, status } = useCustomerStore();
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
  });

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  const busy = status === 'loading';
  const awaitingCode = mode === 'verify' || mode === 'reset';

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  /**
   * One interval drives both countdowns.
   *
   * They are shown because a code that has silently expired is the worst version
   * of this screen: the shopper retypes a correct code, is told it is wrong, and
   * has no way to know why.
   */
  useEffect(() => {
    if (!awaitingCode) return;
    const tick = window.setInterval(() => {
      setResendIn((s) => (s > 0 ? s - 1 : 0));
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [awaitingCode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
        go('verify');
        return;
      }

      if (mode === 'forgot') {
        await customerService.forgotPassword(form.email);
        // Worded the same way whether or not an account exists — the API will
        // not reveal that, so neither does this screen.
        toast.info('Check your email', `If ${form.email} has an account, a code is on its way.`);
        setExpiresIn(10 * 60);
        setResendIn(60);
        setCode('');
        setNewPassword('');
        go('reset');
        return;
      }

      if (mode === 'reset') {
        await resetPassword(form.email, code, newPassword);
        toast.saved('Password changed', 'You are signed in, and other devices are signed out.');
        navigate(redirectTo, { replace: true });
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
      // Which code to re-send depends on which one they are waiting for.
      if (mode === 'reset') await customerService.forgotPassword(form.email);
      else await customerService.resendCode(form.email);
      toast.info('A new code is on its way.');
      setResendIn(60);
      setExpiresIn(10 * 60);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not send another code.');
    }
  };

  const copy = HEADINGS[mode];

  return (
    <AuthShell>
      <h1 className="surface-strong font-display text-3xl tracking-tight">{copy.title}</h1>
      <p className="surface-muted mt-3 text-sm leading-relaxed">
        {typeof copy.blurb === 'function' ? copy.blurb(store.name, form.email) : copy.blurb}
      </p>

      {/* The store's own line, when there is no artwork to put it on. Said once
          either way, never twice. */}
      {mode === 'signin' && !store.theme.loginImageUrl && store.theme.loginMessage && (
        <p className="mt-5 border-l-2 border-brand pl-4 text-sm italic text-ink-700">
          {store.theme.loginMessage}
        </p>
      )}

      <form onSubmit={submit} className="mt-7 space-y-4">
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

        {/* The address is fixed once a code has been sent to it: editing it here
            would leave the code and the field disagreeing. */}
        {!awaitingCode && (
          <Field label="Email">
            <input required type="email" autoComplete="email" {...field('email')} className={input} />
          </Field>
        )}

        {(mode === 'signin' || mode === 'register') && (
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
        )}

        {mode === 'register' && (
          <Field label="Phone (optional)">
            <input type="tel" autoComplete="tel" {...field('phone')} className={input} />
          </Field>
        )}

        {awaitingCode && (
          <>
            <CodeInput value={code} onChange={setCode} />

            {expiresIn > 0 ? (
              <p className="surface-muted text-xs">Expires in {formatClock(expiresIn)}</p>
            ) : (
              <p className="text-xs text-amber-700">
                That code has expired — send yourself a new one.
              </p>
            )}
          </>
        )}

        {mode === 'reset' && (
          <Field label="New password">
            <input
              required
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={input}
            />
          </Field>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || (awaitingCode && code.replace(/\D/g, '').length < 6)}
          className="w-full rounded-card bg-brand py-3 text-sm font-medium text-white transition-transform hover:-translate-y-px disabled:pointer-events-none disabled:opacity-40"
        >
          {busy ? 'Please wait…' : copy.submit}
        </button>
      </form>

      {awaitingCode && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
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
            onClick={() => go(mode === 'reset' ? 'forgot' : 'register')}
            className="surface-muted underline"
          >
            Use a different email
          </button>
        </div>
      )}

      {mode === 'signin' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <button type="button" onClick={() => go('forgot')} className="font-medium text-brand">
            Forgot your password?
          </button>
          <span className="surface-muted">
            No account?{' '}
            <button type="button" onClick={() => go('register')} className="font-medium text-brand">
              Create one
            </button>
          </span>
        </div>
      )}

      {(mode === 'register' || mode === 'forgot') && (
        <p className="surface-muted mt-5 text-sm">
          {mode === 'forgot' ? 'Remembered it? ' : 'Already have an account? '}
          <button type="button" onClick={() => go('signin')} className="font-medium text-brand">
            Sign in
          </button>
        </p>
      )}

      <p className="surface-muted mt-6 text-xs">
        {awaitingCode
          ? 'Nothing changes until the code is confirmed, so you can close this and start again.'
          : 'Shopping without an account works too — your cart is kept either way.'}
      </p>
    </AuthShell>
  );
}

/** Per-mode copy, kept together so the five screens read as one voice. */
const HEADINGS: Record<
  Mode,
  { title: string; blurb: string | ((store: string, email: string) => string); submit: string }
> = {
  signin: {
    title: 'Sign in',
    blurb: (store) => `Your ${store} account.`,
    submit: 'Sign in',
  },
  register: {
    title: 'Create an account',
    blurb: (store) =>
      `This creates an account at ${store}. We will email a code to confirm your address.`,
    submit: 'Send verification code',
  },
  verify: {
    title: 'Check your email',
    blurb: (store, email) =>
      `We sent a 6-digit code to ${email}. Enter it to finish creating your ${store} account.`,
    submit: 'Confirm and create account',
  },
  forgot: {
    title: 'Reset your password',
    blurb: 'Tell us your email address and we will send a code to reset it.',
    submit: 'Send reset code',
  },
  reset: {
    title: 'Choose a new password',
    blurb: (_store, email) =>
      `Enter the code we sent to ${email} and the password you would like to use.`,
    submit: 'Change password and sign in',
  },
};

/**
 * The shell the form sits in.
 *
 * When the store has uploaded artwork the form moves to one side of a split
 * layout; without it the form simply centres. A store that never opens the
 * setting gets a clean page rather than an empty panel where a picture was
 * meant to be — which is why the image is optional rather than a required field
 * with a placeholder.
 *
 * Nothing here sets a height. `StorefrontAuthLayout` owns the viewport and is
 * the only scroll container on the page, so this must be free to be exactly as
 * tall as its content.
 */
function AuthShell({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const { loginImageUrl, loginMessage } = store.theme;

  const form = <div className="w-full max-w-sm px-4 py-10 sm:px-6">{children}</div>;

  if (!loginImageUrl) {
    return <div className="flex min-h-full justify-center">{form}</div>;
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Artwork after the form in source order on narrow screens: a shopper on
          a phone should reach the fields without scrolling past a photograph. */}
      <div className="relative order-last hidden lg:order-first lg:block">
        <img src={loginImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-tr from-ink-950/70 via-ink-950/25 to-transparent" />
        {loginMessage && (
          <div className="absolute inset-x-0 bottom-0 p-10">
            {/* Rendered as text. The API stores it as plain text for exactly
                this reason — a shopkeeper's greeting must not become markup on
                a page every shopper sees. */}
            <p className="max-w-md font-display text-2xl leading-snug tracking-tight text-white">
              {loginMessage}
            </p>
            <p className="mt-3 text-sm text-white/70">{store.name}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center">{form}</div>
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
        className="mt-1.5 w-full rounded-card border border-ink-200 bg-white px-3 py-3 text-center text-2xl font-semibold tracking-[0.4em] text-ink-950 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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

/**
 * Colours stated, not inherited.
 *
 * On a dark storefront `body` is `text-ink-100`, and a control that only styles
 * its border inherits that against the browser's white input background —
 * near-white text on white, invisible while you type.
 */
const input =
  'mt-1.5 w-full rounded-card border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-950 ' +
  'transition-colors placeholder:text-ink-400 hover:border-ink-300 ' +
  'focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-ink-700">{label}</span>
      {children}
    </label>
  );
}
