import { create } from 'zustand';
import { refreshSession } from '@/services/api-client';
import { customerService, type CustomerProfile } from '@/services/customer.service';
import { cartService } from '@/services/cart.service';
import { clearCustomerScopedQueries } from '@/lib/query-client';

interface CustomerState {
  customer: CustomerProfile | null;
  status: 'idle' | 'loading' | 'authenticated' | 'guest';
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Starts a registration. Resolves to the challenge rather than signing in:
   * the account is created by `verifyEmail`, so the caller has to show the code
   * form next.
   */
  register: (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    phone?: string;
  }) => Promise<{ email: string; expiresInSeconds: number; resendInSeconds: number }>;
  /** Confirms the emailed code, creating the account and signing in. */
  verifyEmail: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  hydrate: () => Promise<void>;
}

/**
 * Separate from the staff auth store on purpose. The two never coexist — staff
 * sign in on the admin hostname, customers on a storefront — and merging them
 * would mean one shape pretending to describe two different kinds of account.
 */
export const useCustomerStore = create<CustomerState>()((set) => ({
  customer: null,
  status: 'idle',

  signIn: async (email, password) => {
    set({ status: 'loading' });
    try {
      await customerService.login(email, password);
      // Fold the guest cart in before the profile loads, so the header badge
      // never briefly shows an empty cart the shopper just filled.
      await cartService.merge().catch(() => undefined);
      clearCustomerScopedQueries();
      set({ customer: await customerService.me(), status: 'authenticated' });
    } catch (e) {
      set({ customer: null, status: 'guest' });
      throw e;
    }
  },

  register: async (payload) => {
    set({ status: 'loading' });
    try {
      const challenge = await customerService.register(payload);
      // Back to 'guest', not 'authenticated': nothing has been created yet, and
      // claiming otherwise would let the rest of the app act as if signed in.
      set({ customer: null, status: 'guest' });
      return challenge;
    } catch (e) {
      set({ customer: null, status: 'guest' });
      throw e;
    }
  },

  verifyEmail: async (email, code) => {
    set({ status: 'loading' });
    try {
      await customerService.verifyEmail(email, code);
      // Fold the guest cart in before the profile loads, so the header badge
      // never briefly shows an empty cart the shopper just filled.
      await cartService.merge().catch(() => undefined);
      clearCustomerScopedQueries();
      set({ customer: await customerService.me(), status: 'authenticated' });
    } catch (e) {
      set({ customer: null, status: 'guest' });
      throw e;
    }
  },

  signOut: async () => {
    await customerService.logout();
    clearCustomerScopedQueries();
    set({ customer: null, status: 'guest' });
  },

  /**
   * On reload the access token is gone but the refresh token persists. Trade it
   * before anything renders, exactly as the admin app does.
   */
  hydrate: async () => {
    if (!localStorage.getItem('refresh_token')) {
      set({ status: 'guest' });
      return;
    }

    set({ status: 'loading' });
    try {
      await refreshSession();
      set({ customer: await customerService.me(), status: 'authenticated' });
    } catch {
      localStorage.removeItem('refresh_token');
      set({ customer: null, status: 'guest' });
    }
  },
}));
