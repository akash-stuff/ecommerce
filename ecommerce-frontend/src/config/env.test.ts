import { describe, expect, it } from 'vitest';
import { isAdminHost, resolveApiUrl } from './env';

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
