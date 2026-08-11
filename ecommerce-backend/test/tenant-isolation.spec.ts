import { Prisma } from '@prisma/client';
import {
  PLATFORM_MANAGED_TENANT_MODELS,
  TENANT_SCOPED_MODELS,
} from '../src/common/prisma/tenant-scope';

/**
 * Structural guard against the one mistake that would silently open a
 * cross-tenant leak: adding a tenant-owned model to schema.prisma and
 * forgetting to register it for scoping.
 *
 * The check reads Prisma's own metadata rather than a hand-maintained list, so
 * it cannot drift out of date with the schema.
 *
 * A model carrying `tenantId` must be in exactly one of two places: scoped
 * (the default), or explicitly excused in PLATFORM_MANAGED_TENANT_MODELS with
 * a written reason. Silence is not an option.
 */
describe('tenant scope registry', () => {
  const modelsWithTenantId = Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name);

  it('accounts for every model that has a tenantId column', () => {
    const unaccounted = modelsWithTenantId.filter(
      (m) => !TENANT_SCOPED_MODELS.has(m) && !PLATFORM_MANAGED_TENANT_MODELS.has(m),
    );

    expect(unaccounted).toEqual([]);
  });

  it('never lists a model as both scoped and platform-managed', () => {
    const both = [...TENANT_SCOPED_MODELS].filter((m) =>
      PLATFORM_MANAGED_TENANT_MODELS.has(m),
    );
    expect(both).toEqual([]);
  });

  it('does not scope models that have no tenantId column', () => {
    const names = new Set(modelsWithTenantId);
    const spurious = [...TENANT_SCOPED_MODELS].filter((m) => !names.has(m));
    expect(spurious).toEqual([]);
  });

  it('requires a written justification for each platform-managed exception', () => {
    for (const [model, reason] of PLATFORM_MANAGED_TENANT_MODELS) {
      expect(reason.length).toBeGreaterThan(40);
      expect(modelsWithTenantId).toContain(model);
    }
  });
});
