import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Building2, CreditCard, LayoutDashboard, LayoutTemplate, LogOut, ScrollText,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

const NAV = [
  { to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/platform/tenants', label: 'Stores', icon: Building2 },
  { to: '/platform/plans', label: 'Plans', icon: CreditCard },
  { to: '/platform/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/platform/audit', label: 'Audit log', icon: ScrollText },
];

/**
 * The platform owner's console, deliberately distinct from the tenant admin.
 *
 * A darker chrome is the point: it should be obvious at a glance whether you are
 * operating one store or the whole platform, because the actions available here
 * affect every tenant.
 */
export function PlatformLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-950">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold text-white">Platform</p>
          <p className="mt-0.5 text-xs text-ink-500">Every store</p>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-card px-3 py-2 text-sm ${
                  isActive ? 'bg-ink-800 text-white' : 'text-ink-300 hover:bg-ink-900 hover:text-white'
                }`
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-800 px-5 py-4">
          <p className="truncate text-xs text-ink-300">{user?.email}</p>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="mt-2 flex items-center gap-1.5 text-xs text-ink-500 hover:text-white"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
