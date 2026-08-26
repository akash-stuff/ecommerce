import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

/**
 * Storefront templates are platform assets: one catalogue shared by every
 * tenant, never forked per tenant. Nothing here is tenant-scoped, so every
 * query runs unscoped by necessity — which is why the write routes are
 * reachable only by a super admin.
 *
 * A template's values are *copied* into a store's Theme when the store is
 * provisioned (see TenantsService.create), not read through at render time.
 * That copy is what makes retiring a template safe: an existing storefront
 * keeps rendering exactly as it did, because it no longer depends on the row.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The gallery a new store is chosen from. Retired templates are excluded. */
  listActive() {
    return this.prisma.runUnscoped((db) =>
      db.template.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          description: true,
          previewImage: true,
          defaultTheme: true,
        },
        orderBy: { name: 'asc' },
      }),
    );
  }

  /** Everything, including retired, with how many stores were built from each. */
  findAll() {
    return this.prisma.runUnscoped((db) =>
      db.template.findMany({
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        include: { _count: { select: { stores: true } } },
      }),
    );
  }

  async create(dto: CreateTemplateDto) {
    const slug = slugify(dto.slug ?? dto.name);

    const clash = await this.prisma.runUnscoped((db) =>
      db.template.findUnique({ where: { slug }, select: { id: true } }),
    );
    if (clash) {
      throw new ConflictException({
        message: 'A template with that slug already exists.',
        code: 'TEMPLATE_EXISTS',
      });
    }

    const template = await this.prisma.runUnscoped((db) =>
      db.template.create({
        data: {
          name: dto.name,
          slug,
          category: dto.category,
          description: dto.description,
          previewImage: dto.previewImage,
          defaultTheme: (dto.defaultTheme ?? {}) as Prisma.InputJsonValue,
          layoutConfig: (dto.layoutConfig ?? {}) as Prisma.InputJsonValue,
          isActive: dto.isActive ?? true,
        },
      }),
    );

    void this.audit.record({
      action: 'template.created',
      entityType: 'Template',
      entityId: template.id,
      changes: { name: template.name, slug: template.slug, category: template.category },
    });

    return template;
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findOne(id);

    const data: Prisma.TemplateUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.previewImage !== undefined) data.previewImage = dto.previewImage || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.defaultTheme !== undefined) {
      data.defaultTheme = dto.defaultTheme as Prisma.InputJsonValue;
    }
    if (dto.layoutConfig !== undefined) {
      data.layoutConfig = dto.layoutConfig as Prisma.InputJsonValue;
    }

    const template = await this.prisma.runUnscoped((db) =>
      db.template.update({ where: { id }, data }),
    );

    void this.audit.record({
      action: 'template.updated',
      entityType: 'Template',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });

    /**
     * Deliberately not propagated to existing stores. A tenant's Theme is its
     * own after provisioning — pushing an edit here into live storefronts would
     * silently overwrite branding the tenant chose, which is the opposite of
     * what a white-label platform promises.
     */
    return template;
  }

  /**
   * Removed outright, and refused while any store was built from it.
   *
   * Retiring (`isActive: false`) is the usual move and is always allowed: it
   * takes the template out of the gallery without touching a single storefront.
   * Deletion is offered only for a template nothing was ever built from,
   * because the foreign key from `stores` would otherwise fail anyway — better
   * a clear reason than a constraint error.
   */
  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);

    const inUse = await this.prisma.runUnscoped((db) =>
      db.store.count({ where: { templateId: id } }),
    );

    if (inUse > 0) {
      throw new ConflictException({
        message: `${inUse} store${inUse === 1 ? ' was' : 's were'} built from this template. Retire it instead — that removes it from the gallery and leaves those storefronts untouched.`,
        code: 'TEMPLATE_IN_USE',
      });
    }

    await this.prisma.runUnscoped((db) => db.template.delete({ where: { id } }));

    void this.audit.record({
      action: 'template.deleted',
      entityType: 'Template',
      entityId: id,
      changes: { name: template.name, slug: template.slug },
    });
  }

  private async findOne(id: string) {
    const template = await this.prisma.runUnscoped((db) =>
      db.template.findUnique({ where: { id } }),
    );
    if (!template) {
      throw new NotFoundException({
        message: 'That template does not exist.',
        code: 'TEMPLATE_NOT_FOUND',
      });
    }
    return template;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
