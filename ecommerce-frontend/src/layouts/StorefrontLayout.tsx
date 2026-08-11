import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Search, User, X } from 'lucide-react';
import { useStore } from '@/features/theme/ThemeProvider';
import { useCart } from '@/hooks/useCart';
import { useCustomerStore } from '@/store/customer.store';
import { categoryService } from '@/services/admin.service';

/**
 * One layout, every template. Which sections render and in what order comes
 * from the tenant's theme config, so a fashion store and a grocery store share
 * this file and still look nothing alike.
 */
export function StorefrontLayout() {
  const store = useStore();
  const navigate = useNavigate();
  const { data: cart } = useCart();
  const customer = useCustomerStore((s) => s.customer);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');

  const itemCount = cart?.itemCount ?? 0;

  // Top-level categories only: a mega-menu is a design decision the tenant
  // has not been given a way to make yet.
  const categories = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: categoryService.tree,
    staleTime: 5 * 60_000,
  });

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    navigate(`/search?q=${encodeURIComponent(term.trim())}`);
    setSearchOpen(false);
    setTerm('');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            {store.theme.logoUrl ? (
              <img src={store.theme.logoUrl} alt={store.name} className="h-8 w-auto" />
            ) : (
              <span className="font-display text-lg font-semibold tracking-tight text-brand">
                {store.name}
              </span>
            )}
          </Link>

          <nav className="hidden items-center gap-8 text-sm md:flex">
            <Link to="/shop" className="text-ink-700 hover:text-brand">
              Shop
            </Link>
            {(categories.data ?? []).slice(0, 4).map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.slug}`}
                className="text-ink-700 hover:text-brand"
              >
                {category.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen((open) => !open)}
              aria-label={searchOpen ? 'Close search' : 'Search'}
              aria-expanded={searchOpen}
              className="rounded-card p-2 text-ink-700 hover:bg-ink-50"
            >
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </button>

            <Link
              to={customer ? '/account' : '/account/sign-in'}
              aria-label={customer ? 'Your account' : 'Sign in'}
              className="rounded-card p-2 text-ink-700 hover:bg-ink-50"
            >
              <User size={18} />
            </Link>

            <Link
              to="/cart"
              aria-label={itemCount > 0 ? `Cart, ${itemCount} items` : 'Cart'}
              className="relative rounded-card p-2 text-ink-700 hover:bg-ink-50"
            >
              <ShoppingBag size={18} />
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-medium leading-none text-white">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-ink-100 bg-white">
            <form onSubmit={submitSearch} className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
              <input
                autoFocus
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="w-full rounded-card border border-ink-300 px-4 py-2.5 text-sm focus:border-brand focus:outline-none"
              />
            </form>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-20 border-t border-ink-100 bg-ink-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="font-display text-base text-ink-900">{store.name}</p>
          {store.description && (
            <p className="mt-2 max-w-md text-sm text-ink-500">{store.description}</p>
          )}

          <nav className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-700">
            <Link to="/shop" className="hover:text-brand">Shop</Link>
            <Link to="/cart" className="hover:text-brand">Cart</Link>
            <Link to={customer ? '/account' : '/account/sign-in'} className="hover:text-brand">
              {customer ? 'Your account' : 'Sign in'}
            </Link>
          </nav>

          <p className="mt-8 text-xs text-ink-500">
            © {new Date().getFullYear()} {store.name}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
