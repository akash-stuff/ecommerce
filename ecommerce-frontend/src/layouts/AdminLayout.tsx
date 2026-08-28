import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Tags, ShoppingCart, Users, Boxes, Truck, Mail,
  Ticket, Palette, BarChart3, Settings, LogOut, Star, FileText, Image, Menu, X,
  ExternalLink, CreditCard, AtSign, UserCog,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { tenantUrl } from '@/config/env';
import { Toaster } from '@/components/Toasts';
import { PERMISSIONS } from '@/config/permissions';

/**
 * Grouped rather than one flat list of fifteen.
 *
 * A flat list makes every screen look equally likely, so finding Shipping means
 * reading all fifteen labels. The groups are the shopkeeper's own division of
 * the work — what you sell, what you have sold, who you sell to — not ours.
 */
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Selling',
    items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true, permission: null },
      { to: '/admin/orders', label: 'Orders', icon: ShoppingCart, permission: PERMISSIONS.ORDERS_READ },
      { to: '/admin/customers', label: 'Customers', icon: Users, permission: PERMISSIONS.CUSTOMERS_READ },
      { to: '/admin/subscribers', label: 'Subscribers', icon: AtSign, permission: PERMISSIONS.CUSTOMERS_READ },
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: PERMISSIONS.ANALYTICS_READ },
    ],
  },
  {
    group: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products', icon: Package, permission: PERMISSIONS.PRODUCTS_READ },
      { to: '/admin/categories', label: 'Categories', icon: Tags, permission: PERMISSIONS.CATEGORIES_READ },
      { to: '/admin/inventory', label: 'Inventory', icon: Boxes, permission: PERMISSIONS.INVENTORY_READ },
      { to: '/admin/reviews', label: 'Reviews', icon: Star, permission: PERMISSIONS.REVIEWS_MODERATE },
    ],
  },
  {
    group: 'Storefront',
    items: [
      { to: '/admin/theme', label: 'Appearance', icon: Palette, permission: PERMISSIONS.THEME_UPDATE },
      { to: '/admin/banners', label: 'Banners', icon: Image, permission: PERMISSIONS.THEME_UPDATE },
      { to: '/admin/pages', label: 'Pages', icon: FileText, permission: PERMISSIONS.PAGES_WRITE },
      { to: '/admin/coupons', label: 'Coupons', icon: Ticket, permission: PERMISSIONS.COUPONS_READ },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/admin/shipping', label: 'Shipping', icon: Truck, permission: PERMISSIONS.SHIPPING_READ },
      { to: '/admin/payments', label: 'Payments', icon: CreditCard, permission: PERMISSIONS.PAYMENTS_MANAGE },
      { to: '/admin/notifications', label: 'Notifications', icon: Mail, permission: PERMISSIONS.SETTINGS_READ },
      { to: '/admin/staff', label: 'Staff', icon: UserCog, permission: PERMISSIONS.STAFF_READ },
      { to: '/admin/settings', label: 'Settings', icon: Settings, permission: PERMISSIONS.SETTINGS_READ },
    ],
  },
];

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  permission: string | null;
}

/**
 * Admin chrome carries the *platform's* colours, not the tenant's.
 *
 * This tree is deliberately outside ThemeProvider, so `brand` here resolves to
 * the CSS fallback in index.css — the platform green — and never to whichever
 * store was last loaded in the tab. That is what makes it safe to use the token
 * in the navigation: the console looks the same for every store, while the
 * storefront stays entirely the tenant's.
 */
export function AdminLayout() {
  const { user, logout, can } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const storefrontUrl = user?.tenantSlug ? tenantUrl(user.tenantSlug) : '/';

  // The drawer is navigation, so a completed navigation is what closes it.
  // Closing on click instead would leave it open whenever the route changed for
  // any other reason — a redirect, the back button.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((g) => g.items.length > 0);

  const sidebar = (
    <>
      <div className="flex h-16 items-center justify-between px-5">
        <span className="font-display text-sm font-semibold tracking-tight text-ink-950">
          Store admin
        </span>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="-mr-1 rounded p-1 text-ink-500 hover:bg-ink-50 lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {groups.map(({ group, items }) => (
          <div key={group} className="mb-4 last:mb-0">
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-400">
              {group}
            </p>
            <div className="space-y-0.5">
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    [
                      'group flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-brand font-medium text-white shadow-glow-sm'
                        : 'text-ink-700 hover:bg-brand/[0.06] hover:text-brand',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={16}
                        strokeWidth={1.75}
                        className={isActive ? '' : 'text-ink-400 group-hover:text-ink-700'}
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-100 p-3">
        {/* The storefront, from the admin. Opened in a new tab rather than
            navigated to: losing an unsaved theme edit to "let me just look" is
            a bad trade. */}
        <a
           href={storefrontUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-1 flex items-center gap-3 rounded-card px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
        >
          <ExternalLink size={16} strokeWidth={1.75} className="text-ink-400" />
          View storefront
        </a>

        <div className="px-3 pb-2 pt-1">
          <p className="truncate text-sm text-ink-900">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="truncate text-xs text-ink-500">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
        >
          <LogOut size={16} strokeWidth={1.75} className="text-ink-400" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="admin-chrome flex min-h-screen bg-ink-50 bg-brand-wash bg-fixed">
      <Toaster />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-100 bg-white lg:flex">
        {sidebar}
      </aside>

      {/* Below lg the sidebar is a drawer. Without it there is no navigation at
          all on a phone, which is where a shopkeeper checks orders. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/50 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-dialog">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-100 bg-white px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="-ml-2 rounded-card p-2 text-ink-700 hover:bg-ink-50"
          >
            <Menu size={20} />
          </button>
          <span className="font-display text-sm font-semibold tracking-tight text-ink-950">
            Store admin
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
