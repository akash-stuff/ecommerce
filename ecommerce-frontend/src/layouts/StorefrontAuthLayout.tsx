import { Link, Outlet } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '@/features/theme/ThemeProvider';
import { LOGO_HEIGHT } from '@/features/theme/backgrounds';
import { Toaster } from '@/components/Toasts';

/**
 * The shell for signing in, registering and resetting a password.
 *
 * Deliberately not `StorefrontLayout`. That one carries the full site chrome —
 * a search bar, a category nav, a cart badge and a four-column footer — which
 * together added about 500px to a page whose entire content is four fields.
 * The result was an auth screen you had to scroll, with the shop's marketing
 * furniture competing with the one thing the visitor came to do.
 *
 * So: the store's own branding, a way back to the shop, and nothing else.
 *
 * `h-[100dvh]` rather than `h-screen`. On mobile browsers `100vh` counts the
 * space behind the address bar, so a "full height" page is taller than what you
 * can see and scrolls by exactly the height of the browser chrome — which is
 * the bug this layout exists to avoid.
 */
export function StorefrontAuthLayout() {
  const store = useStore();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Toaster />

      {/*
        The logo is capped here rather than following the store's setting.

        That ladder is tuned for the storefront, where the header is free to
        grow to fit it. On this screen the viewport is the budget — the form
        below has to fit inside what is left — so a store set to "Large" would
        spend 72px of a 720px laptop on its own logo and push the register
        form's submit button off the bottom. The middle step is still
        unmistakably the brand.
      */}
      <header className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-8 sm:py-4">
        <Link to="/" className="flex min-w-0 items-center">
          {store.theme.logoUrl ? (
            <img
              src={store.theme.logoUrl}
              alt={store.name}
              className={`w-auto max-w-[10rem] object-contain object-left sm:max-w-[13rem] ${
                store.theme.logoSize === 'sm' ? LOGO_HEIGHT.sm : LOGO_HEIGHT.md
              }`}
            />
          ) : (
            <span className="surface-strong truncate font-display text-lg font-semibold tracking-tight sm:text-xl">
              {store.name}
            </span>
          )}
        </Link>

        <Link
          to="/"
          className="surface-muted group inline-flex shrink-0 items-center gap-1.5 text-sm transition-colors hover:text-brand"
        >
          <ArrowLeft
            size={14}
            className="transition-transform group-hover:-translate-x-0.5"
          />
          Back to the shop
        </Link>
      </header>

      {/*
        The only scroll container on the page.
        Registration has five fields and a small laptop in landscape has very
        little height, so the form has to be able to scroll *itself* — what must
        not happen is the whole document scrolling and taking the branding panel
        with it.
      */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
