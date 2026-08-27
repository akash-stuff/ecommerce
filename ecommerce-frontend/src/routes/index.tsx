import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './guards';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { StorefrontLayout } from '@/layouts/StorefrontLayout';
import { StorefrontAuthLayout } from '@/layouts/StorefrontAuthLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { PlatformLayout } from '@/layouts/PlatformLayout';

const Home = lazy(() => import('@/pages/storefront/Home'));
const ProductDetail = lazy(() => import('@/pages/storefront/ProductDetail'));
const Shop = lazy(() => import('@/pages/storefront/Shop'));
const CategoryPage = lazy(() => import('@/pages/storefront/CategoryPage'));
const SignIn = lazy(() => import('@/pages/storefront/SignIn'));
const Account = lazy(() => import('@/pages/storefront/Account'));
const Wishlist = lazy(() => import('@/pages/storefront/Wishlist'));
const CmsPage = lazy(() => import('@/pages/storefront/CmsPage'));
const Cart = lazy(() => import('@/pages/storefront/Cart'));
const Checkout = lazy(() => import('@/pages/storefront/Checkout'));
const OrderConfirmation = lazy(() => import('@/pages/storefront/OrderConfirmation'));
const Login = lazy(() => import('@/pages/auth/Login'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminProducts = lazy(() => import('@/pages/admin/Products'));
const AdminProductForm = lazy(() => import('@/pages/admin/ProductForm'));
const AdminOrders = lazy(() => import('@/pages/admin/Orders'));
const AdminOrderDetail = lazy(() => import('@/pages/admin/OrderDetail'));
const AdminCategories = lazy(() => import('@/pages/admin/Categories'));
const AdminCoupons = lazy(() => import('@/pages/admin/Coupons'));
const AdminShipping = lazy(() => import('@/pages/admin/Shipping'));
const AdminInventory = lazy(() => import('@/pages/admin/Inventory'));
const AdminNotifications = lazy(() => import('@/pages/admin/Notifications'));
const AdminAppearance = lazy(() => import('@/pages/admin/Appearance'));
const AdminBanners = lazy(() => import('@/pages/admin/Banners'));
const AdminSubscribers = lazy(() => import('@/pages/admin/Subscribers'));
const AdminReviews = lazy(() => import('@/pages/admin/Reviews'));
const AdminCustomers = lazy(() => import('@/pages/admin/Customers'));
const AdminCustomerDetail = lazy(() => import('@/pages/admin/CustomerDetail'));
const AdminSettings = lazy(() => import('@/pages/admin/Settings'));
const AdminPayments = lazy(() => import('@/pages/admin/Payments'));
const AdminAnalytics = lazy(() => import('@/pages/admin/Analytics'));
const AdminPages = lazy(() => import('@/pages/admin/Pages'));
const PlatformOverview = lazy(() => import('@/pages/platform/Overview'));
const PlatformTenants = lazy(() => import('@/pages/platform/Tenants'));
const PlatformPlans = lazy(() => import('@/pages/platform/Plans'));
const PlatformTemplates = lazy(() => import('@/pages/platform/Templates'));
const PlatformAudit = lazy(() => import('@/pages/platform/AuditLog'));
const PlatformNotifications = lazy(() => import('@/pages/platform/Notifications'));

const Loading = () => <div className="p-10 text-sm text-ink-500">Loading…</div>;
const wrap = (el: JSX.Element) => <Suspense fallback={<Loading />}>{el}</Suspense>;

/**
 * Three route trees on one bundle, separated by concern:
 *   /            storefront   — themed per tenant, mostly public
 *   /admin       tenant admin — authenticated, tenant-scoped
 *   /platform    super admin  — authenticated, platform-scoped
 *
 * The storefront tree is wrapped in ThemeProvider; the admin trees are not,
 * because admin chrome stays neutral regardless of which tenant is signed in.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ThemeProvider>
        <StorefrontLayout />
      </ThemeProvider>
    ),
    children: [
      { index: true, element: wrap(<Home />) },
      { path: 'product/:slug', element: wrap(<ProductDetail />) },
      { path: 'shop', element: wrap(<Shop />) },
      { path: 'search', element: wrap(<Shop />) },
      { path: 'category/:slug', element: wrap(<CategoryPage />) },
      { path: 'account', element: wrap(<Account />) },
      { path: 'wishlist', element: wrap(<Wishlist />) },
      { path: 'cart', element: wrap(<Cart />) },
      { path: 'checkout', element: wrap(<Checkout />) },
      { path: 'order/:orderNumber', element: wrap(<OrderConfirmation />) },
      // Last in the storefront tree: a tenant page claims any remaining
      // single-segment address, so it must not shadow a built-in route. The
      // API refuses reserved slugs for the same reason.
      { path: ':slug', element: wrap(<CmsPage />) },
    ],
  },
  {
    /**
     * Signing in gets the store's branding but not its furniture.
     *
     * Its own tree rather than a child of StorefrontLayout: the header, nav and
     * footer added ~500px to a four-field form and made the page scroll. The
     * ThemeProvider is still here, so the page is unmistakably this store's.
     */
    path: '/account/sign-in',
    element: (
      <ThemeProvider>
        <StorefrontAuthLayout />
      </ThemeProvider>
    ),
    children: [{ index: true, element: wrap(<SignIn />) }],
  },
  { path: '/login', element: wrap(<Login />) },
  {
    path: '/admin',
    element: <RequireAuth roles={['TENANT_OWNER', 'TENANT_ADMIN', 'STAFF']} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: wrap(<AdminDashboard />) },
          { path: 'products', element: wrap(<AdminProducts />) },
          { path: 'products/new', element: wrap(<AdminProductForm />) },
          { path: 'products/:id/edit', element: wrap(<AdminProductForm />) },
          { path: 'orders', element: wrap(<AdminOrders />) },
          { path: 'orders/:id', element: wrap(<AdminOrderDetail />) },
          { path: 'categories', element: wrap(<AdminCategories />) },
          { path: 'coupons', element: wrap(<AdminCoupons />) },
          { path: 'shipping', element: wrap(<AdminShipping />) },
          { path: 'inventory', element: wrap(<AdminInventory />) },
          { path: 'notifications', element: wrap(<AdminNotifications />) },
          { path: 'theme', element: wrap(<AdminAppearance />) },
          { path: 'banners', element: wrap(<AdminBanners />) },
          { path: 'subscribers', element: wrap(<AdminSubscribers />) },
          { path: 'reviews', element: wrap(<AdminReviews />) },
          { path: 'customers', element: wrap(<AdminCustomers />) },
          { path: 'customers/:id', element: wrap(<AdminCustomerDetail />) },
          { path: 'analytics', element: wrap(<AdminAnalytics />) },
          { path: 'settings', element: wrap(<AdminSettings />) },
          { path: 'payments', element: wrap(<AdminPayments />) },
          { path: 'pages', element: wrap(<AdminPages />) },
        ],
      },
    ],
  },
  {
    // Only a super admin gets here; the guard checks the role and the API
    // refuses every platform route for anyone else regardless.
    path: '/platform',
    element: <RequireAuth roles={['SUPER_ADMIN']} />,
    children: [
      {
        element: <PlatformLayout />,
        children: [
          { index: true, element: wrap(<PlatformOverview />) },
          { path: 'tenants', element: wrap(<PlatformTenants />) },
          { path: 'plans', element: wrap(<PlatformPlans />) },
          { path: 'templates', element: wrap(<PlatformTemplates />) },
          { path: 'notifications', element: wrap(<PlatformNotifications />) },
          { path: 'audit', element: wrap(<PlatformAudit />) },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
