import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, CreditCard, LayoutDashboard, LayoutTemplate, LogOut, Menu,
  ScrollText, X,
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
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const sidebar = (
    <>
      <div className="flex items-start justify-between px-5 py-5">
        <div>
          <p className="text-sm font-semibold text-white">Platform</p>
          <p className="mt-0.5 text-xs text-ink-400">Every store</p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="-mr-1 rounded p-1 text-ink-400 hover:bg-ink-900 hover:text-white lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-card px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-ink-800 font-medium text-white'
                  : 'text-ink-300 hover:bg-ink-900 hover:text-white'
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
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="mt-2 flex items-center gap-1.5 text-xs text-ink-400 transition-colors hover:text-white"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="admin-chrome flex min-h-screen bg-ink-50">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-950 lg:flex">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-60 flex-col bg-ink-950 shadow-dialog">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Same height as the tenant admin's bar, because Page's sticky header
            offsets by exactly that on small screens. */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-ink-950 px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="-ml-2 rounded-card p-2 text-ink-300 hover:bg-ink-900 hover:text-white"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-white">Platform</span>
        </div>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
