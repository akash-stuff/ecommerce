import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import type { ApiError } from '@/types/api';

/**
 * One axios instance for the whole app.
 *
 * Note what is NOT here: any tenant identifier. The browser's hostname already
 * carries that information and the backend refuses to read it from anywhere
 * else, so adding an `X-Tenant-Id` header would be theatre.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/**
 * On a 401, try exactly one silent refresh and replay the request. Concurrent
 * 401s share a single refresh call so a page with six queries does not fire six
 * rotations — with rotating refresh tokens that would revoke the family.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const status = error.response?.status;
    const code = error.response?.data?.code;

    const isRefreshable =
      status === 401 &&
      original &&
      !original._retried &&
      code !== 'INVALID_CREDENTIALS' &&
      !original.url?.includes('/auth/');

    if (isRefreshable) {
      original._retried = true;
      try {
        const token = await refreshSession();
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      } catch {
        onSessionExpired();
      }
    }

    return Promise.reject(normalizeError(error));
  },
);

/**
 * Exchange the stored refresh token for an access token, sharing the in-flight
 * call with the 401 interceptor so a reload never rotates the token twice.
 */
export function refreshSession(): Promise<string> {
  return (refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  }));
}

async function performRefresh(): Promise<string> {
  const stored = localStorage.getItem('refresh_token');
  if (!stored) throw new Error('No refresh token');

  const { data } = await axios.post(`${env.apiUrl}/auth/refresh`, { refreshToken: stored });
  const tokens = data.data;
  setAccessToken(tokens.accessToken);
  localStorage.setItem('refresh_token', tokens.refreshToken);
  return tokens.accessToken;
}

let sessionExpiredHandler: () => void = () => {};
export function onSessionExpiredHandler(fn: () => void): void {
  sessionExpiredHandler = fn;
}
function onSessionExpired(): void {
  setAccessToken(null);
  localStorage.removeItem('refresh_token');
  sessionExpiredHandler();
}

export interface NormalizedError {
  message: string;
  code: string;
  status: number;
  details?: string[];
}

/** Every caller gets the same shape, including on network failure. */
function normalizeError(error: AxiosError<ApiError>): NormalizedError {
  if (error.response?.data && typeof error.response.data === 'object') {
    const body = error.response.data;
    return {
      message: body.message ?? 'Something went wrong.',
      code: body.code ?? 'UNKNOWN',
      status: error.response.status,
      details: body.details,
    };
  }
  if (error.code === 'ECONNABORTED') {
    return { message: 'The request took too long. Try again.', code: 'TIMEOUT', status: 0 };
  }
  return {
    message: 'Cannot reach the server. Check your connection.',
    code: 'NETWORK_ERROR',
    status: 0,
  };
}

/** Unwraps `{ success, data }` so callers work with the payload directly. */
export async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  return (await promise).data.data;
}
