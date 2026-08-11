import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient, refreshSession, setAccessToken, unwrap } from '@/services/api-client';
import type { AuthUser } from '@/types/api';

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  can: (permission: string) => boolean;
}

/**
 * Only the refresh token is persisted; the access token stays in memory so it
 * is not readable by anything that can reach localStorage.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      status: 'idle',
      error: null,

      login: async (email, password) => {
        set({ status: 'loading', error: null });
        try {
          const result = await unwrap<{
            accessToken: string;
            refreshToken: string;
            user: AuthUser;
          }>(apiClient.post('/auth/login', { email, password }));

          setAccessToken(result.accessToken);
          localStorage.setItem('refresh_token', result.refreshToken);
          set({ user: result.user, status: 'authenticated', error: null });
        } catch (e) {
          const message = (e as { message?: string }).message ?? 'Could not sign in.';
          set({ status: 'unauthenticated', error: message, user: null });
          throw e;
        }
      },

      logout: async () => {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          await apiClient.post('/auth/logout', { refreshToken }).catch(() => undefined);
        }
        setAccessToken(null);
        localStorage.removeItem('refresh_token');
        set({ user: null, status: 'unauthenticated' });
      },

      /**
       * A reload keeps the persisted user and the refresh token, but the access
       * token lived in memory and is gone. Trade the refresh token for a new one
       * before any page renders, otherwise requests go out unauthenticated —
       * and on public endpoints that fails quietly rather than as a 401 the
       * interceptor could recover from.
       */
      hydrate: async () => {
        const hasSession = Boolean(localStorage.getItem('refresh_token')) && Boolean(get().user);
        if (!hasSession) {
          set({ status: 'unauthenticated', user: null });
          return;
        }

        set({ status: 'loading' });
        try {
          await refreshSession();
          set({ status: 'authenticated' });
        } catch {
          setAccessToken(null);
          localStorage.removeItem('refresh_token');
          set({ status: 'unauthenticated', user: null });
        }
      },

      /**
       * Permission checks here are for hiding controls the user cannot use.
       * They are a courtesy, not a control — the API enforces the real rule.
       */
      can: (permission) => get().user?.permissions.includes(permission) ?? false,
    }),
    { name: 'auth', partialize: (s) => ({ user: s.user }) },
  ),
);
