import { describe, expect, it } from 'vitest';
import { isAdminHost, resolveApiUrl, tenantUrl } from './env';

/**
 * The `{host}` placeholder is what lets one bundle serve every tenant: the
 * backend resolves the tenant from the Host header, so a storefront request
 * has to arrive on the tenant's own hostname rather than a fixed API origin.
 */
describe('resolveApiUrl', () => {
  it('sends a storefront request to the tenant hostname', () => {
    expect(resolveApiUrl('http://{host}:4000/api/v1', 'northwind.platform.localhost')).toBe(
      'http://northwind.platform.localhost:4000/api/v1',
    );
  });

  it('gives two tenants two different API origins', () => {
    const template = 'http://{host}:4000/api/v1';
    expect(resolveApiUrl(template, 'northwind.platform.localhost')).not.toBe(
      resolveApiUrl(template, 'voltway.platform.localhost'),
    );
  });

  it('resolves a custom domain to itself, not to the platform apex', () => {
    expect(resolveApiUrl('https://{host}/api/v1', 'shop.acme-corp.com')).toBe(
      'https://shop.acme-corp.com/api/v1',
    );
  });

  it('leaves a URL without the placeholder untouched', () => {
    expect(resolveApiUrl('https://api.platform.com/v1', 'northwind.platform.localhost')).toBe(
      'https://api.platform.com/v1',
    );
  });

  it('supports a same-origin relative base', () => {
    expect(resolveApiUrl('/api/v1', 'northwind.platform.localhost')).toBe('/api/v1');
  });
});

describe('isAdminHost', () => {
  it('treats the admin console and bare localhost as tenant-less', () => {
    expect(isAdminHost('admin.platform.localhost')).toBe(true);
    expect(isAdminHost('localhost')).toBe(true);
  });

  it('treats a tenant subdomain as a storefront', () => {
    expect(isAdminHost('northwind.platform.localhost')).toBe(false);
  });

  it('does not mistake a tenant whose name starts with "admin" for the console', () => {
    expect(isAdminHost('administrators-choice.platform.localhost')).toBe(false);
  });
});

/**
 * The admin console is served from a host with no storefront on it, so any
 * link from admin to a shopper-facing page has to be absolute and carry the
 * tenant's own hostname. This is the function that builds it — the Pages list
 * previously used a relative `/${slug}`, which resolved against the console's
 * host and opened a platform page instead of the store's.
 */
describe('tenantUrl', () => {
  const stub = (protocol: string, port: string) => {
    Object.defineProperty(window, 'location', {
      value: { protocol, port, hostname: `admin.platform.localhost` },
      writable: true,
    });
  };

  it('puts the tenant on its own subdomain of the platform domain', () => {
    stub('http:', '');
    expect(tenantUrl('northwind')).toBe('http://northwind.platform.localhost');
  });

  it('keeps the dev port, so a link from the console opens on the same server', () => {
    stub('http:', '5173');
    expect(tenantUrl('northwind')).toBe('http://northwind.platform.localhost:5173');
  });

  it('follows the current scheme rather than hard-coding one', () => {
    stub('https:', '');
    expect(tenantUrl('voltway')).toBe('https://voltway.platform.localhost');
  });
});
