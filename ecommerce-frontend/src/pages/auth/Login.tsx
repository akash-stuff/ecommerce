import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { apiClient, unwrap } from '@/services/api-client';
import { CodeInput } from '@/components/CodeInput';
import { EverystoreMark, Wordmark } from '@/features/platform/brand';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type FormValues = z.infer<typeof schema>;

/** One primary button, so sign-in and reset cannot drift apart. */
const SUBMIT =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm ' +
  'font-medium text-white shadow-glow transition-all hover:-translate-y-px hover:shadow-lifted ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ' +
  'disabled:translate-y-0 disabled:opacity-60 disabled:shadow-glow-sm';

/** Shared by both inputs so a focus ring never disagrees between them. */
const FIELD =
  'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-950 shadow-card ' +
  'placeholder:text-ink-400 transition-colors hover:border-ink-300 ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 ' +
  'disabled:opacity-60';

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  /**
   * The reset flow replaces the form rather than opening a dialog: it is the
   * same task at the same address, and a modal over a sign-in screen reads as
   * an interruption of something the person had not started.
   */
  const [resetting, setResetting] = useState(false);
  /** Carried back after a reset, so the sign-in form says it worked. */
  const [notice, setNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await login(values.email, values.password);

      /**
       * A super admin manages the platform, not a single store, so they land in
       * the platform console. Anyone sent here by a guard goes back where they
       * were trying to go — but only if their role can actually be there.
       *
       * The check matters: a guard sends an unauthenticated visitor here with
       * the path they wanted, and honouring it blindly means signing in
       * successfully and being bounced straight back out by the same guard.
       * Login then looks like it ignored you.
       */
      const role = useAuthStore.getState().user?.role;
      const home = role === 'SUPER_ADMIN' ? '/platform' : '/admin';
      const requested = (location.state as { from?: string })?.from;

      navigate(requested?.startsWith(home) ? requested : home, { replace: true });
    } catch (e) {
      setFormError((e as { message?: string }).message ?? 'Could not sign in.');
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/*
        The brand half, hidden below lg.
        On a phone this would push the form below the fold to show decoration,
        which is the wrong trade on the one screen whose entire job is four
        fields — so it is removed rather than stacked.
      */}
      <aside className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden border-r border-ink-100 bg-ink-50/70 p-12 text-ink-900 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute left-[-8rem] top-[-10rem] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(closest-side,rgb(22_101_52_/_0.12),transparent)] blur-2xl" />
          <div className="absolute bottom-[-12rem] right-[-6rem] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(closest-side,rgb(245_165_36_/_0.16),transparent)] blur-2xl" />
        </div>

        <Link
          to="/"
          className="relative z-10 inline-flex w-fit items-center text-brand transition-opacity hover:opacity-80"
        >
          <Wordmark />
        </Link>

        <div className="relative z-10">
          <p className="font-display text-3xl leading-tight tracking-tight text-ink-950">
            One platform.
            <br />
            <span className="text-brand">Every store its own.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-600">
            Store owners and platform staff sign in here. Where you land depends
            on what you run.
          </p>
        </div>

        <p className="relative z-10 text-xs text-ink-500">
          Everystore — white-label commerce.
        </p>
      </aside>

      {/* The form half. */}
      <div className="flex flex-1 flex-col px-5 py-8 sm:px-10">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1.5 rounded px-1 text-sm text-ink-500 transition-colors hover:text-ink-950 lg:invisible"
        >
          <ArrowLeft size={14} />
          Everystore
        </Link>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <span className="text-brand lg:hidden">
              <EverystoreMark size={30} />
            </span>

            {resetting ? (
              <ResetFlow
                onDone={(message) => {
                  setResetting(false);
                  setNotice(message);
                }}
                onCancel={() => setResetting(false)}
              />
            ) : (
              <>
            <h1 className="mt-5 font-display text-2xl tracking-tight text-ink-950 lg:mt-0">
              Sign in
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">Manage your store.</p>

            {notice && (
              <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-800">
                {notice}
              </p>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@yourstore.com"
                  aria-invalid={Boolean(errors.email)}
                  disabled={isSubmitting}
                  {...register('email')}
                  className={`mt-1.5 ${FIELD}`}
                />
                {errors.email && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink-700">
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                    disabled={isSubmitting}
                    {...register('password')}
                    className={`${FIELD} pr-11`}
                  />
                  {/*
                    A reveal toggle, because a typo in a masked field is
                    indistinguishable from a wrong password — and the usual
                    response is a password reset nobody needed.
                  */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-400 transition-colors hover:text-ink-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setNotice(null);
                    setResetting(true);
                  }}
                  className="rounded text-xs font-medium text-brand hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                >
                  Forgot your password?
                </button>
              </div>

              {formError && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
                >
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  <span>{formError}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-medium text-white shadow-glow transition-all hover:-translate-y-px hover:shadow-lifted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:translate-y-0 disabled:opacity-60 disabled:shadow-glow-sm"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-8 text-xs leading-relaxed text-ink-500">
              Shopping at one of these stores? Sign in on that store&apos;s own
              site instead — this door is for running one.
            </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * "I forgot my password", for a store owner or platform administrator.
 *
 * Two steps, both against tenant-less routes: an admin account belongs to a
 * person, not to a shop, and one login may open several. The email arrives from
 * the platform rather than from a store for the same reason.
 *
 * Step one always reports success, whether or not the address has an account.
 * This screen must not become a way to discover which addresses can administer
 * a store — which is why the copy says "if it has an account" rather than
 * "we have sent you a code".
 */
function ResetFlow({
  onDone,
  onCancel,
}: {
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  // The cooldown the server enforces, shown rather than left to be discovered
  // by pressing a button that refuses.
  useEffect(() => {
    if (resendIn <= 0) return;
    const tick = window.setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(tick);
  }, [resendIn]);

  const request = async () => {
    setError(null);
    setBusy(true);
    try {
      await unwrap<{ sent: true }>(
        apiClient.post('/auth/forgot-password', { email: email.trim().toLowerCase() }),
      );
      setStep('code');
      setResendIn(60);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not send a code.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unwrap<{ reset: true }>(
        apiClient.post('/auth/reset-password', {
          email: email.trim().toLowerCase(),
          code,
          password,
        }),
      );
      // Deliberately not signed in: a staff session carries a tenant chosen at
      // sign-in, and someone who staffs three stores has no obvious one.
      onDone('Your password has been changed. Sign in with it.');
    } catch (err) {
      setError((err as { message?: string }).message ?? 'That did not work.');
      setRejected((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="mt-5 font-display text-2xl tracking-tight text-ink-950 lg:mt-0">
        {step === 'email' ? 'Reset your password' : 'Check your email'}
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        {step === 'email'
          ? 'We will email you a code to set a new one.'
          : `If ${email} has an account, a 6-digit code is on its way.`}
      </p>

      {step === 'email' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void request();
          }}
          className="mt-8 space-y-5"
          noValidate
        >
          <div>
            <label htmlFor="reset-email" className="block text-sm font-medium text-ink-700">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourstore.com"
              disabled={busy}
              className={`mt-1.5 ${FIELD}`}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
            >
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim()}
            className={SUBMIT}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? 'Sending…' : 'Send the code'}
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          <CodeInput
            value={code}
            onChange={(next) => {
              setCode(next);
              if (error) setError(null);
            }}
            disabled={busy}
            invalid={Boolean(error)}
            attempt={rejected}
          />

          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-ink-700">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className={`mt-1.5 ${FIELD}`}
            />
            {/* Mirrors the server's own rule, so the button is not a dead end. */}
            <p className="mt-1.5 text-xs text-ink-500">At least 8 characters.</p>
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
            >
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.length < 6 || password.length < 8}
            className={SUBMIT}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? 'Saving…' : 'Change password and sign in'}
          </button>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <button
              type="button"
              onClick={() => void request()}
              disabled={busy || resendIn > 0}
              className="font-medium text-brand disabled:text-ink-400"
            >
              {resendIn > 0 ? `Send another in ${resendIn}s` : 'Send another code'}
            </button>
            <button
              type="button"
              onClick={() => setStep('email')}
              className="text-ink-500 underline"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-8 inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-ink-950"
      >
        <ArrowLeft size={14} />
        Back to sign in
      </button>

      <p className="mt-6 text-xs leading-relaxed text-ink-500">
        Changing it signs you out everywhere. A sign-in belongs to a person, so if
        you run more than one store this is the password for all of them.
      </p>
    </>
  );
}
