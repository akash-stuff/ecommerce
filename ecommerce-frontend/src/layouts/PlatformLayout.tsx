import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, CreditCard, LayoutDashboard, LayoutTemplate, LogOut, Mail, Menu,
  ScrollText, X,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Toaster } from '@/components/Toasts';

const NAV = [
  { to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/platform/tenants', label: 'Stores', icon: Building2 },
  { to: '/platform/plans', label: 'Plans', icon: CreditCard },
  { to: '/platform/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/platform/notifications', label: 'Notifications', icon: Mail },
  { to: '/platform/audit', label: 'Audit log', icon: ScrollText },
];

/**
 * The platform owner's console, deliberately distinct from the tenant admin.
 *
 * It has to be obvious at a glance which one you are in, because the actions
 * here affect every tenant. That used to be done with a dark rail, then with a
 * solid green one — both of which made the console read as *the green app*
 * rather than as a considered surface.
 *
 * The distinction is now carried by two quiet things instead of one loud one:
 * the "Super admin" chip under the title, and an active nav item that is a
 * tinted panel with a green marker, where the store console uses a solid green
 * pill. White ground, green only where it means something.
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
          <p className="font-display text-sm font-semibold tracking-tight text-ink-950">
            Platform
          </p>
          {/* The chip, not the chrome, is what says "this is the whole estate". */}
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand ring-1 ring-inset ring-brand/15">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-secondary" />
            Super admin
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="-mr-1 rounded p-1 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 lg:hidden"
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
              `group relative flex items-center gap-2.5 rounded-card px-3 py-2 text-sm transition-all ${
                isActive
                  ? 'bg-brand/[0.08] font-medium text-brand ring-1 ring-inset ring-brand/15'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* The marker rides the left edge of the panel, so the row does
                    not shift by a pixel when it becomes active. */}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <item.icon
                  size={16}
                  strokeWidth={1.75}
                  className={isActive ? 'text-brand' : 'text-ink-400 group-hover:text-ink-600'}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-100 px-5 py-4">
        <p className="truncate text-xs text-ink-600">{user?.email}</p>
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="mt-2 flex items-center gap-1.5 text-xs text-ink-500 transition-colors hover:text-brand"
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="admin-chrome flex min-h-screen bg-ink-50 bg-brand-wash bg-fixed">
      <Toaster />
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-ink-100 bg-white bg-[linear-gradient(to_bottom,rgb(22_101_52_/_0.04),transparent_16rem)] lg:flex">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/40 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-60 flex-col bg-white shadow-dialog">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Same height as the tenant admin's bar, because Page's sticky header
            offsets by exactly that on small screens. */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="-ml-2 rounded-card p-2 text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-ink-950">Platform</span>
        </div>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
