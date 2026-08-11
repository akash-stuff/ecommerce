import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types/api';

/**
 * Route guards keep unauthorised UI off the screen. They are not a security
 * boundary — every one of these checks is repeated server-side.
 */
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
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}

export function RequirePermission({ permission }: { permission: string }) {
  const can = useAuthStore((s) => s.can);
  if (!can(permission)) {
    return (
      <div className="p-10">
        <h2 className="font-display text-lg">You don't have access to this</h2>
        <p className="mt-1 text-sm text-ink-500">
          Ask a store owner to grant you the "{permission}" permission.
        </p>
      </div>
    );
  }
  return <Outlet />;
}
