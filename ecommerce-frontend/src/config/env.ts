/**
 * The frontend knows two things about the world: where the API is, and what
 * the platform apex domain is. It never knows which tenant it is serving —
 * that is decided by the backend from the hostname the browser used.
 *
 * Because the backend reads the tenant from the Host header and refuses to
 * take it from anywhere else, a storefront request has to *arrive on the
 * tenant's own hostname*. A fixed `http://localhost:4000` API URL would send
 * every request to a platform admin host, where no tenant resolves.
 *
 * So VITE_API_URL may contain a `{host}` placeholder, replaced at runtime with
 * the hostname the page was loaded from:
 *
 *   http://{host}:4000/api/v1   dev — northwind.platform.localhost:4000
 *   https://{host}/api/v1       prod — the tenant domain proxies /api
 *   /api/v1                     same-origin deployments; no placeholder needed
 *
 * A URL without the placeholder is used verbatim, which is correct for the
 * admin console: it has no tenant hostname, and its tenant comes from the JWT.
 */
const RAW_API_URL = import.meta.env.VITE_API_URL ?? 'http://{host}:4000/api/v1';

export function resolveApiUrl(
  template: string = RAW_API_URL,
  hostname: string = typeof window === 'undefined' ? 'localhost' : window.location.hostname,
): string {
  return template.replace(/\{host\}/g, hostname);
}

export const env = {
  apiUrl: resolveApiUrl(),
  platformDomain: import.meta.env.VITE_STORE_DOMAIN ?? 'platform.localhost',
} as const;

/** The platform console never tries to resolve itself as a tenant. */
export function isPlatformHost(hostname = window.location.hostname): boolean {
  return hostname === `admin.${env.platformDomain}` || hostname.startsWith('admin.');
}

/** The bare development address is a useful store picker, not a fake store. */
export function isDevelopmentHost(hostname = window.location.hostname): boolean {
  return hostname === 'localhost' || hostname === env.platformDomain;
}

/** True when running a staff console rather than a customer storefront. */
export function isAdminHost(hostname = window.location.hostname): boolean {
  return isDevelopmentHost(hostname) || isPlatformHost(hostname);
}

/** Keep the current dev port when opening a tenant from the platform console. */
export function tenantUrl(slug: string): string {
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${slug}.${env.platformDomain}${port}`;
}
