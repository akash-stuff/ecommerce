import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useStore } from '@/features/theme/ThemeProvider';
import { LOGO_HEIGHT } from '@/features/theme/backgrounds';
import { useCart } from '@/hooks/useCart';
import { useCustomerStore } from '@/store/customer.store';
import { categoryService } from '@/services/admin.service';
import { bannerService } from '@/services/store.service';
import { BannerLink } from '@/components/BannerLink';
import { Toaster } from '@/components/Toasts';
import { apiClient, unwrap } from '@/services/api-client';

/**
 * One layout, every template. Which sections render and in what order comes
 * from the tenant's theme config, so a fashion store and a grocery store share
 * this file and still look nothing alike.
 *
 * Surfaces are named by role — `surface`, `surface-header`, `surface-muted` —
 * rather than coloured directly, so a store on a dark background inverts as one
 * piece instead of one component at a time. See index.css.
 */
export function StorefrontLayout() {
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: cart } = useCart();
  const customer = useCustomerStore((s) => s.customer);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');

  const itemCount = cart?.itemCount ?? 0;

  // Closed by a completed navigation rather than by the click, so a redirect or
  // the back button closes it too.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Top-level categories only: a mega-menu is a design decision the tenant
  // has not been given a way to make yet.
  const categories = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: categoryService.tree,
    staleTime: 5 * 60_000,
  });

  // Whatever the tenant has published: About, Contact, Terms.
  const pages = useQuery({
    queryKey: ['storefront-pages'],
    queryFn: () => unwrap<{ slug: string; title: string }[]>(apiClient.get('/pages')),
    staleTime: 5 * 60_000,
  });

  // A scheduled strip above the header. Usually absent, so its own query keeps
  // it off the critical path of the store config every page already waits on.
  const announcements = useQuery({
    queryKey: ['banners', 'SITE_ANNOUNCEMENT'],
    queryFn: () => bannerService.live('SITE_ANNOUNCEMENT'),
    staleTime: 5 * 60_000,
  });

  const announcement = announcements.data?.[0];
  const navCategories = (categories.data ?? []).slice(0, 5);
  const social = Object.entries(store.theme.socialLinks ?? {});

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    navigate(`/search?q=${encodeURIComponent(term.trim())}`);
    setSearchOpen(false);
    setTerm('');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Toaster />
      {announcement && (
        // Above the sticky header, so it scrolls away instead of permanently
        // eating vertical space on a phone.
        <BannerLink
          href={announcement.linkUrl}
          className="block bg-brand px-4 py-2.5 text-center text-xs tracking-wide text-white sm:text-[13px]"
        >
          <span className="font-medium">{announcement.title}</span>
          {announcement.subtitle && (
            <span className="ml-2 text-white/70">{announcement.subtitle}</span>
          )}
        </BannerLink>
      )}

      <header className="surface-header sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-4 px-4 sm:h-20 sm:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="-ml-2 rounded-full p-2 text-ink-700 transition-colors hover:bg-ink-50 md:hidden"
          >
            <Menu size={20} />
          </button>

          {/* The logo is given real room. A wordmark cropped to 32px reads as a
              placeholder, which is the opposite of what a brand mark is for.
              `object-contain` with a max width keeps a very wide logo from
              pushing the navigation off the row. */}
          <Link to="/" className="flex shrink-0 items-center">
            {store.theme.logoUrl ? (
              <img
                src={store.theme.logoUrl}
                alt={store.name}
                className={`w-auto max-w-[11rem] object-contain object-left sm:max-w-[15rem] ${
                  LOGO_HEIGHT[store.theme.logoSize] ?? LOGO_HEIGHT.md
                }`}
              />
            ) : (
              <span className="surface-strong font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {store.name}
              </span>
            )}
          </Link>

          <nav className="ml-6 hidden flex-1 items-center gap-7 text-sm md:flex">
            <HeaderLink to="/shop">Shop</HeaderLink>
            {navCategories.map((category) => (
              <HeaderLink key={category.id} to={`/category/${category.slug}`}>
                {category.name}
              </HeaderLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-0.5">
            <IconButton
              label={searchOpen ? 'Close search' : 'Search'}
              onClick={() => setSearchOpen((open) => !open)}
              expanded={searchOpen}
            >
              {searchOpen ? <X size={19} /> : <Search size={19} />}
            </IconButton>

            <IconLink
              to={customer ? '/account' : '/account/sign-in'}
              label={customer ? 'Your account' : 'Sign in'}
            >
              <User size={19} />
            </IconLink>

            <IconLink
              to="/cart"
              label={itemCount > 0 ? `Cart, ${itemCount} items` : 'Cart'}
            >
              <ShoppingBag size={19} />
              {itemCount > 0 && (
                <span className="absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </IconLink>
          </div>
        </div>

        {searchOpen && (
          <div className="surface-line border-t">
            <form onSubmit={submitSearch} className="mx-auto max-w-7xl px-4 py-4 sm:px-8">
              <input
                autoFocus
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="w-full rounded-full border border-ink-200 bg-white/70 px-5 py-3 text-sm text-ink-950 transition-colors placeholder:text-ink-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </form>
          </div>
        )}
      </header>

      {/* Below md the navigation is a drawer, so a phone still has a way to
          reach categories without scrolling the whole homepage. */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-ink-950/50 animate-fade-in"
            onClick={() => setMenuOpen(false)}
          />
          <nav className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-dialog">
            <div className="flex h-[4.5rem] items-center justify-between px-5">
              <span className="font-display text-lg font-semibold text-ink-950">
                {store.name}
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="-mr-2 rounded-full p-2 text-ink-500 hover:bg-ink-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <DrawerLink to="/shop">Shop everything</DrawerLink>
              {navCategories.map((c) => (
                <DrawerLink key={c.id} to={`/category/${c.slug}`}>
                  {c.name}
                </DrawerLink>
              ))}
              <div className="my-3 border-t border-ink-100" />
              <DrawerLink to={customer ? '/account' : '/account/sign-in'}>
                {customer ? 'Your account' : 'Sign in'}
              </DrawerLink>
              <DrawerLink to="/cart">Cart{itemCount > 0 ? ` (${itemCount})` : ''}</DrawerLink>
              {(pages.data ?? []).map((page) => (
                <DrawerLink key={page.slug} to={`/${page.slug}`}>
                  {page.title}
                </DrawerLink>
              ))}
            </div>
          </nav>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="surface-footer mt-24 border-t">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              {store.theme.logoUrl ? (
                <img
                  src={store.theme.logoUrl}
                  alt={store.name}
                  className="h-9 w-auto max-w-[13rem] object-contain object-left"
                />
              ) : (
                <p className="surface-strong font-display text-xl tracking-tight">
                  {store.name}
                </p>
              )}
              {store.description && (
                <p className="surface-muted mt-4 max-w-sm text-sm leading-relaxed">
                  {store.description}
                </p>
              )}
              {social.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {social.map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="surface-line rounded-full border px-3.5 py-1.5 text-xs capitalize text-ink-700 transition-colors hover:border-brand hover:text-brand"
                    >
                      {platform}
                    </a>
                  ))}
                </div>
              )}
            </div>

            <FooterColumn title="Shop">
              <FooterLink to="/shop">All products</FooterLink>
              {navCategories.slice(0, 4).map((c) => (
                <FooterLink key={c.id} to={`/category/${c.slug}`}>
                  {c.name}
                </FooterLink>
              ))}
            </FooterColumn>

            <FooterColumn title="Your account">
              <FooterLink to={customer ? '/account' : '/account/sign-in'}>
                {customer ? 'Your account' : 'Sign in'}
              </FooterLink>
              <FooterLink to="/cart">Cart</FooterLink>
              {customer && <FooterLink to="/wishlist">Saved items</FooterLink>}
              {(pages.data ?? []).map((page) => (
                <FooterLink key={page.slug} to={`/${page.slug}`}>
                  {page.title}
                </FooterLink>
              ))}
            </FooterColumn>
          </div>

          <div className="surface-line mt-14 flex flex-wrap items-center justify-between gap-3 border-t pt-8">
            <p className="surface-muted text-xs">
              © {new Date().getFullYear()} {store.name}. All rights reserved.
            </p>
            <p className="surface-muted text-xs">{store.email}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * A nav link with an underline that grows from the left on hover.
 *
 * Colour alone is a weak affordance on a storefront whose brand colour might be
 * a pale gold; the rule gives the same feedback whatever the palette.
 */
function HeaderLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="group relative py-1 text-ink-700 transition-colors hover:text-brand">
      {children}
      <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-brand transition-all duration-300 group-hover:w-full" />
    </Link>
  );
}

function IconButton({
  label,
  expanded,
  onClick,
  children,
}: {
  label: string;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className="rounded-full p-2.5 text-ink-700 transition-colors hover:bg-ink-50 hover:text-brand"
    >
      {children}
    </button>
  );
}

function IconLink({
  to,
  label,
  children,
}: {
  to: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative rounded-full p-2.5 text-ink-700 transition-colors hover:bg-ink-50 hover:text-brand"
    >
      {children}
    </Link>
  );
}

function DrawerLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="block rounded-card px-3 py-2.5 text-sm text-ink-900 transition-colors hover:bg-ink-50 hover:text-brand"
    >
      {children}
    </Link>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="surface-strong text-[11px] font-semibold uppercase tracking-[0.14em]">
        {title}
      </p>
      <nav className="mt-4 flex flex-col gap-2.5 text-sm">{children}</nav>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="text-ink-700 transition-colors hover:text-brand">
      {children}
    </Link>
  );
}
