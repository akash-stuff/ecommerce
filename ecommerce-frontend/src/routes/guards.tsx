import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types/api';

/**
 * Route guards keep unauthorised UI off the screen. They are not a security
 * boundary — every one of these checks is repeated server-side.
 */

/**
 * The console a role belongs in.
 *
 * A super admin operates the platform and has no tenant context at all, so the
 * store admin is not a lesser version of their console — it is a different one
 * that cannot work for them. Every tenant role is the other way round.
 */
function consoleFor(role: Role): string {
  return role === 'SUPER_ADMIN' ? '/platform' : '/admin';
}

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, status } = useAuthStore();
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return <div className="p-10 text-sm text-ink-500">Checking your session…</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    const home = consoleFor(user.role);

    /**
     * Redirected only when there is somewhere else to go.
     *
     * The previous version always sent a rejected user to `/admin`. For a
     * SUPER_ADMIN — who is not in the `/admin` role list — that meant `/admin`
     * redirecting to `/admin`, forever: React Router re-rendered the same
     * `<Navigate>` on every pass and the app rendered *nothing at all*. A super
     * admin who reached `/admin` by any route got a white screen with no
     * navigation and no way back to their own console.
     *
     * Guarding on the destination is what makes that structurally impossible:
     * a guard can no longer send anyone to a path this same guard protects.
     */
    if (!location.pathname.startsWith(home)) {
      return <Navigate to={home} replace />;
    }

    return <WrongConsole role={user.role} />;
  }

  return <Outlet />;
}

/**
 * The dead end, when a redirect would loop.
 *
 * Reached only if a role is barred from the very console it belongs to, which
 * means the route table and `consoleFor` disagree. That is a bug rather than a
 * user error, so it says so plainly instead of bouncing silently — the failure
 * this whole file exists to avoid is a blank page nobody can explain.
 */
function WrongConsole({ role }: { role: Role }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-lg text-ink-950">This console isn&apos;t for your account</h1>
        <p className="mt-2 text-sm text-ink-500">
          You are signed in as <span className="text-ink-900">{role.replace(/_/g, ' ').toLowerCase()}</span>,
          which does not have access here.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            to={consoleFor(role)}
            className="rounded-card bg-ink-950 px-4 py-2 text-sm font-medium text-white"
          >
            Go to your console
          </Link>
          <Link
            to="/login"
            className="rounded-card border border-ink-200 bg-white px-4 py-2 text-sm text-ink-900"
          >
            Sign in as someone else
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RequirePermission({ permission }: { permission: string }) {
  const can = useAuthStore((s) => s.can);
  if (!can(permission)) {
    return (
      <div className="p-10">
        <h2 className="font-display text-lg">You don&apos;t have access to this</h2>
        <p className="mt-1 text-sm text-ink-500">
          Ask a store owner to grant you the &quot;{permission}&quot; permission.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
