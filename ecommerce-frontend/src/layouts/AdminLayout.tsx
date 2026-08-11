import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Tags, ShoppingCart, Users, Boxes, Truck, Mail,
  Ticket, Palette, BarChart3, Settings, LogOut, Star,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { PERMISSIONS } from '@/config/permissions';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true, permission: null },
  { to: '/admin/products', label: 'Products', icon: Package, permission: PERMISSIONS.PRODUCTS_READ },
  { to: '/admin/categories', label: 'Categories', icon: Tags, permission: PERMISSIONS.CATEGORIES_READ },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes, permission: PERMISSIONS.INVENTORY_READ },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingCart, permission: PERMISSIONS.ORDERS_READ },
  { to: '/admin/customers', label: 'Customers', icon: Users, permission: PERMISSIONS.CUSTOMERS_READ },
  { to: '/admin/coupons', label: 'Coupons', icon: Ticket, permission: PERMISSIONS.COUPONS_READ },
  { to: '/admin/shipping', label: 'Shipping', icon: Truck, permission: PERMISSIONS.SHIPPING_READ },
  { to: '/admin/notifications', label: 'Notifications', icon: Mail, permission: PERMISSIONS.SETTINGS_READ },
  { to: '/admin/reviews', label: 'Reviews', icon: Star, permission: PERMISSIONS.REVIEWS_MODERATE },
  { to: '/admin/theme', label: 'Appearance', icon: Palette, permission: PERMISSIONS.THEME_UPDATE },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: PERMISSIONS.ANALYTICS_READ },
  { to: '/admin/settings', label: 'Settings', icon: Settings, permission: PERMISSIONS.SETTINGS_READ },
];

/**
 * Admin chrome is deliberately achromatic. On a white-label platform the only
 * saturated colour on an admin screen should be the tenant's own brand, shown
 * where it is being edited — not competing with the navigation.
 */
export function AdminLayout() {
  const { user, logout, can } = useAuthStore();
  const navigate = useNavigate();

  const visible = NAV.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-100 bg-white lg:flex">
        <div className="flex h-16 items-center px-5">
          <span className="font-display text-sm font-semibold tracking-tight text-ink-950">
            Store admin
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {visible.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-ink-950 text-white'
                    : 'text-ink-700 hover:bg-ink-50 hover:text-ink-950',
                ].join(' ')
              }
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-100 p-3">
          <div className="px-2 pb-2">
            <p className="truncate text-sm text-ink-900">{user?.firstName} {user?.lastName}</p>
            <p className="truncate text-xs text-ink-500">{user?.email}</p>
          </div>
          <button
            onClick={async () => { await logout(); navigate('/login'); }}
            className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
          >
            <LogOut size={16} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-x-hidden">
        <Outlet />
      </div>
    </div>
  );
}
