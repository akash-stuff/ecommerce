import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@/test/render';
import { AdminLayout } from './AdminLayout';
import { PlatformLayout } from './PlatformLayout';
import { useAuthStore } from '@/store/auth.store';

/**
 * Both consoles carry the platform's own lockup.
 *
 * The store admin does too, deliberately: it is the software the shopkeeper
 * signed in to, and no shopper ever sees it. The *storefront* is where the
 * platform stays invisible — that separation is the product, so a test that
 * pins the brand into the admin is also the place to say where it must not go.
 *
 * Rendered rather than eyeballed because both screens sit behind a sign-in and
 * are the two least likely to be opened while changing something else.
 */
const signIn = (permissions: string[] = []) =>
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 'u1',
      email: 'owner@northwind.example',
      firstName: 'Priya',
      lastName: 'Raman',
      role: 'TENANT_OWNER',
      permissions,
      tenantSlug: 'northwind',
    } as never,
  });

/** The lockup sets the name in two halves, so it is matched as one node. */
const lockups = () =>
  screen.getAllByText((_, node) => node?.textContent === 'everystore' && node.children.length === 1);

describe('the brand in the two consoles', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: 'unauthenticated' });
  });

  /**
   * The lockup alone. The platform console earns a chip because it warns that
   * an action reaches every tenant; the store admin is the ordinary case and a
   * label there only named the obvious.
   */
  it('names the platform in the store admin, and nothing else', () => {
    signIn();
    render(<AdminLayout />, { route: '/admin' });

    expect(lockups().length).toBeGreaterThan(0);
    expect(screen.queryByText('Store admin')).not.toBeInTheDocument();
  });

  it('names the platform in the console, beside a Super admin chip', () => {
    signIn();
    render(<PlatformLayout />, { route: '/platform' });

    expect(lockups().length).toBeGreaterThan(0);
    expect(screen.getAllByText('Super admin').length).toBeGreaterThan(0);
  });

  /**
   * The mark paints itself; see MARK_GREEN. If either console ever goes back to
   * tinting it with a class, a stale or missing stylesheet makes the logo
   * vanish rather than merely look wrong.
   */
  it('draws a mark that carries its own colour', () => {
    signIn();
    render(<AdminLayout />, { route: '/admin' });

    const bags = document.querySelectorAll('svg rect[mask]');
    expect(bags.length).toBeGreaterThan(0);
    bags.forEach((bag) => expect(bag.getAttribute('fill')).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it('sets the coloured half of the name inline, not from the palette', () => {
    signIn();
    render(<PlatformLayout />, { route: '/platform' });

    const [lockup] = lockups();
    const store = within(lockup).getByText('store');
    expect(store.getAttribute('style')).toMatch(/color/);
  });
});
