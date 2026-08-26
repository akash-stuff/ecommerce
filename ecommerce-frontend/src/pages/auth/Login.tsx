import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/auth.store';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

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
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm rounded-card border border-ink-100 bg-white p-8">
        <h1 className="font-display text-xl tracking-tight text-ink-950">Sign in</h1>
        <p className="mt-1 text-sm text-ink-500">Manage your store.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm text-ink-700">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
              className="mt-1 w-full rounded-card border border-ink-100 px-3 py-2 text-sm focus:border-ink-300"
            />
            {errors.email && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-ink-700">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
              className="mt-1 w-full rounded-card border border-ink-100 px-3 py-2 text-sm focus:border-ink-300"
            />
            {errors.password && (
              <p role="alert" className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-card bg-ink-950 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
