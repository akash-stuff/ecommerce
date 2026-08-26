import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { storeService } from '@/services/store.service';
import type { StoreConfig } from '@/types/api';
import { surfaceFor, surfaceForImage } from './backgrounds';

const StoreContext = createContext<StoreConfig | null>(null);

/** Storefront components read tenant branding through this, never from imports. */
export function useStore(): StoreConfig {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <ThemeProvider>.');
  return store;
}

/**
 * Fetches the store config for the current hostname and writes it into CSS
 * custom properties, the document title and the favicon.
 *
 * This is the mechanism that makes the platform white-label: there is exactly
 * one built bundle, and every visible brand decision arrives at runtime.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['store-config'],
    queryFn: storeService.getConfig,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!data) return;
    const { theme, name, metaTitle, metaDescription } = data;
    const root = document.documentElement;

    root.style.setProperty('--brand-primary', toRgbChannels(theme.primaryColor));
    root.style.setProperty('--brand-secondary', toRgbChannels(theme.secondaryColor));
    root.style.setProperty('--font-body', `'${theme.bodyFont}'`);
    root.style.setProperty('--font-heading', `'${theme.headingFont}'`);

    document.title = metaTitle || name;
    setMeta('description', metaDescription ?? '');
    setMeta('og:title', metaTitle || name, 'property');
    if (theme.faviconUrl) setFavicon(theme.faviconUrl);

    loadFonts([theme.bodyFont, theme.headingFont]);
    applyCustomCss(theme.customCss);

    /**
     * The page background, painted on <body> rather than a wrapper div.
     *
     * A wrapper is only as tall as its content, so a short page — an empty cart,
     * a 404 — would show white below the fold with the background stopping
     * halfway. `background-attachment: fixed` also behaves as intended only on
     * a full-height painting area.
     *
     * An uploaded image wins over a preset: a store that went to the trouble of
     * choosing its own artwork did not mean "and also the aurora".
     */
    const surface = theme.backgroundImageUrl
      ? surfaceForImage(theme.backgroundImageUrl, theme.backgroundFit)
      : surfaceFor(theme.background, theme.primaryColor, theme.secondaryColor);

    Object.assign(document.body.style, surface.style);
    // A class, not inline colours: components need to know the surface is dark
    // so borders and muted text can invert together rather than one at a time.
    root.classList.toggle('surface-dark', surface.dark);

    return () => {
      // Undone on unmount so a hot reload, or the admin console mounted in the
      // same tab, does not inherit a storefront's background.
      for (const key of Object.keys(surface.style)) {
        document.body.style.removeProperty(
          key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
        );
      }
      root.classList.remove('surface-dark');
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-300 border-t-ink-900" />
        <span className="sr-only">Loading store</span>
      </div>
    );
  }

  if (isError || !data) {
    const notFound = (error as { code?: string })?.code === 'TENANT_NOT_RESOLVED';
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-xl text-ink-900">
            {notFound ? 'No store at this address' : 'This store is unavailable'}
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {notFound
              ? 'Check the web address, or contact the store owner.'
              : 'The store could not be loaded. Try again in a moment.'}
          </p>
          {!notFound && (
            <button
              onClick={() => refetch()}
              className="mt-5 rounded-card bg-ink-900 px-4 py-2 text-sm text-white"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return <StoreContext.Provider value={data}>{children}</StoreContext.Provider>;
}

/** Tailwind's `<alpha-value>` syntax needs space-separated channels. */
function toRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized.padEnd(6, '0');
  const int = parseInt(full.slice(0, 6), 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name'): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setFavicon(url: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

/**
 * The tenant's own stylesheet.
 *
 * Written with `textContent`, never `innerHTML`: the browser then treats the
 * value strictly as stylesheet text, so even if something unsafe reached this
 * point it could not become markup. The server sanitises on write and again on
 * read; this is the third layer and the cheapest.
 */
function applyCustomCss(css: string | null): void {
  const id = 'tenant-custom-css';
  document.getElementById(id)?.remove();
  if (!css) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/** Only the fonts a tenant actually chose are requested. */
function loadFonts(families: string[]): void {
  const unique = [...new Set(families.filter(Boolean))];
  const id = 'tenant-fonts';
  document.getElementById(id)?.remove();

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${unique
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&')}&display=swap`;
  document.head.appendChild(link);
}
