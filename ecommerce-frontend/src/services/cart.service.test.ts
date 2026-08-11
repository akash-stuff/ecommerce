import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guest cart token is the only piece of cart state the browser owns, and
 * getting its scope wrong is a cross-store bug that looks like data loss: a
 * shopper switches stores and their cart appears to vanish.
 */
describe('guest cart token storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  const load = async (hostname: string) => {
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hostname },
    });
    return import('./cart.service');
  };

  it('round-trips a token', async () => {
    const { getCartToken, setCartToken } = await load('northwind.platform.localhost');

    expect(getCartToken()).toBeNull();
    setCartToken('abc123');
    expect(getCartToken()).toBe('abc123');
  });

  it('keeps each store\'s token separate', async () => {
    const northwind = await load('northwind.platform.localhost');
    northwind.setCartToken('token-northwind');

    vi.resetModules();
    const voltway = await load('voltway.platform.localhost');

    // Voltway must not inherit Northwind's cart token.
    expect(voltway.getCartToken()).toBeNull();

    voltway.setCartToken('token-voltway');
    expect(voltway.getCartToken()).toBe('token-voltway');

    vi.resetModules();
    const backAgain = await load('northwind.platform.localhost');
    expect(backAgain.getCartToken()).toBe('token-northwind');
  });

  it('clears the token when passed null', async () => {
    const { getCartToken, setCartToken } = await load('northwind.platform.localhost');

    setCartToken('abc123');
    setCartToken(null);
    expect(getCartToken()).toBeNull();
  });
});
