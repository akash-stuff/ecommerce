import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { EverystoreMark, Wordmark } from '@/features/platform/brand';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type FormValues = z.infer<typeof schema>;

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

            <h1 className="mt-5 font-display text-2xl tracking-tight text-ink-950 lg:mt-0">
              Sign in
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">Manage your store.</p>

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
          </div>
        </div>
      </div>
    </div>
  );
}
