import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

/** Depth cap for the nested tree. Deeper than this is a modelling mistake. */
const MAX_DEPTH = 5;

/**
 * Follows the products module exactly: no method mentions tenantId, because the
 * Prisma extension supplies it from the resolved hostname.
 *
 * The nesting is what makes this module more than CRUD — a parent from another
 * tenant, a cycle, or an orphaned subtree are all reachable through the API if
 * nobody checks, so each is checked here.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: CategoryQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.CategoryWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.rootOnly ? { parentId: null } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.category.findMany({
        where,
        include: {
          _count: { select: { children: true, products: true } },
        },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.category.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /**
   * The whole tree in one query, assembled in memory. A storefront nav needs
   * every category anyway, and one round trip beats N recursive ones.
   */
  async findTree(activeOnly = true): Promise<CategoryNode[]> {
    const rows = await this.prisma.db.category.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        slug: true,
        imageUrl: true,
        position: true,
        isActive: true,
      },
    });

    return buildTree(rows);
  }

  async findOne(id: string) {
    const category = await this.prisma.db.category.findFirst({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          select: { id: true, name: true, slug: true, position: true },
          orderBy: { position: 'asc' },
        },
        _count: { select: { products: true } },
      },
    });

    if (!category) throw this.notFound();
    return category;
  }

  async findBySlug(slug: string) {
    const category = await this.prisma.db.category.findFirst({
      where: { slug, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!category) throw this.notFound();
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);
    await this.assertSlugFree(slug);

    if (dto.parentId) await this.assertParentUsable(dto.parentId);

    return this.prisma.db.category.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: { ...dto, slug } as unknown as Prisma.CategoryCreateInput,
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id); // 404s if it belongs to another tenant

    if (dto.slug) await this.assertSlugFree(dto.slug, id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException({
          message: 'A category cannot be its own parent.',
          code: 'CATEGORY_CYCLE',
        });
      }
      await this.assertParentUsable(dto.parentId, id);
    }

    return this.prisma.db.category.update({
      where: { id },
      data: dto as Prisma.CategoryUpdateInput,
    });
  }

  /**
   * Hard delete, unlike products: nothing snapshots a category the way an order
   * line snapshots a product. It is refused while anything still points at it,
   * because silently orphaning a subtree or nulling a product's category is a
   * worse outcome than an error the caller can act on.
   */
  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);

    if (category.children.length > 0) {
      throw new ConflictException({
        message: 'Move or delete the subcategories first.',
        code: 'CATEGORY_HAS_CHILDREN',
      });
    }

    if (category._count.products > 0) {
      throw new ConflictException({
        message: 'Reassign the products in this category first.',
        code: 'CATEGORY_HAS_PRODUCTS',
      });
    }

    await this.prisma.db.category.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------

  private async assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.db.category.findFirst({
      where: { slug },
      select: { id: true },
    });

    if (clash && clash.id !== exceptId) {
      throw new ConflictException({
        message: 'A category with this slug already exists.',
        code: 'CATEGORY_SLUG_TAKEN',
      });
    }
  }

  /**
   * A parent must exist *in this tenant* — the scoped read is what guarantees
   * that — and must not sit inside the subtree of the category being moved,
   * which would detach that subtree from the root.
   */
  private async assertParentUsable(parentId: string, movingId?: string): Promise<void> {
    const parent = await this.prisma.db.category.findFirst({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });

    if (!parent) {
      throw new BadRequestException({
        message: 'That parent category does not exist.',
        code: 'CATEGORY_PARENT_NOT_FOUND',
      });
    }

    let cursor: string | null = parent.parentId;
    for (let depth = 0; cursor && depth < MAX_DEPTH; depth += 1) {
      if (movingId && cursor === movingId) {
        throw new BadRequestException({
          message: 'That would place the category inside its own subtree.',
          code: 'CATEGORY_CYCLE',
        });
      }
      const ancestor: { parentId: string | null } | null =
        await this.prisma.db.category.findFirst({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = ancestor?.parentId ?? null;
    }

    if (cursor) {
      throw new BadRequestException({
        message: `Categories may not nest more than ${MAX_DEPTH} levels deep.`,
        code: 'CATEGORY_TOO_DEEP',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: 'That category does not exist.',
      code: 'CATEGORY_NOT_FOUND',
    });
  }
}

export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  children: CategoryNode[];
}

export type CategoryRow = Omit<CategoryNode, 'children'>;

/**
 * Rows whose parent is missing from the set (an inactive parent, say) are
 * returned as roots rather than dropped — a category the storefront cannot
 * reach at all is harder to notice than one in the wrong place.
 */
export function buildTree(rows: CategoryRow[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>(
    rows.map((row) => [row.id, { ...row, children: [] }]),
  );

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}
