import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BannerPlacement,
  CreateBannerDto,
  UpdateBannerDto,
} from './dto/banner.dto';

/**
 * Promotional banners: tenant-owned, scheduled, and rendered in a fixed set of
 * storefront slots.
 *
 * Scheduling is evaluated on read rather than by a job that flips `isActive`.
 * A background sweep would make a banner's visibility depend on a worker
 * having run, so a missed tick would silently keep a finished sale on the
 * homepage. Comparing the window at query time cannot drift.
 */
@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Storefront ------------------------------------------------------------

  /** Only what a shopper should see right now. */
  listLive(placement?: BannerPlacement) {
    const now = new Date();

    return this.prisma.db.banner.findMany({
      where: {
        isActive: true,
        ...(placement ? { placement } : {}),
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        linkUrl: true,
        placement: true,
        position: true,
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  // --- Admin -----------------------------------------------------------------

  /**
   * Everything, including scheduled and expired, with a computed `isLive` so
   * the admin list can say *why* a banner is not showing. "Active" alone is
   * misleading for a banner whose window has passed.
   */
  async findAll(placement?: BannerPlacement) {
    const banners = await this.prisma.db.banner.findMany({
      where: placement ? { placement } : {},
      orderBy: [{ placement: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });

    const now = new Date();
    return banners.map((banner) => ({
      ...banner,
      isLive:
        banner.isActive &&
        (!banner.startsAt || banner.startsAt <= now) &&
        (!banner.endsAt || banner.endsAt >= now),
    }));
  }

  async create(dto: CreateBannerDto) {
    const placement = dto.placement ?? 'HOME_HERO';
    assertRenderable(placement, dto.imageUrl, dto.title);
    const window = parseWindow(dto.startsAt, dto.endsAt);

    const banner = await this.prisma.db.banner.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        imageUrl: dto.imageUrl ?? null,
        linkUrl: safeLink(dto.linkUrl),
        placement,
        position: dto.position ?? 0,
        isActive: dto.isActive ?? true,
        ...window,
      } as unknown as Prisma.BannerCreateInput,
    });

    void this.audit.record({
      action: 'banner.created',
      entityType: 'Banner',
      entityId: banner.id,
      changes: { placement: banner.placement, title: banner.title },
    });

    return banner;
  }

  async update(id: string, dto: UpdateBannerDto) {
    const existing = await this.findOne(id);

    // Checked against the merged result, not the patch: clearing the image on a
    // hero is only invalid in combination with the placement it already has.
    assertRenderable(
      dto.placement ?? (existing.placement as BannerPlacement),
      dto.imageUrl !== undefined ? dto.imageUrl : existing.imageUrl ?? undefined,
      dto.title !== undefined ? dto.title : existing.title ?? undefined,
    );

    const data: Prisma.BannerUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title || null;
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle || null;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl || null;
    if (dto.linkUrl !== undefined) data.linkUrl = safeLink(dto.linkUrl);
    if (dto.placement !== undefined) data.placement = dto.placement;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      // Validated as a pair: changing one end must still leave a sane window,
      // so the value not being edited comes from the stored row.
      const window = parseWindow(
        dto.startsAt !== undefined ? dto.startsAt : existing.startsAt?.toISOString(),
        dto.endsAt !== undefined ? dto.endsAt : existing.endsAt?.toISOString(),
      );
      data.startsAt = window.startsAt;
      data.endsAt = window.endsAt;
    }

    const banner = await this.prisma.db.banner.update({ where: { id }, data });

    void this.audit.record({
      action: 'banner.updated',
      entityType: 'Banner',
      entityId: id,
      changes: { fields: Object.keys(dto) },
    });

    return banner;
  }

  async remove(id: string): Promise<void> {
    const banner = await this.findOne(id);
    await this.prisma.db.banner.delete({ where: { id } });

    void this.audit.record({
      action: 'banner.deleted',
      entityType: 'Banner',
      entityId: id,
      changes: { placement: banner.placement, title: banner.title },
    });
  }

  private async findOne(id: string) {
    const banner = await this.prisma.db.banner.findFirst({ where: { id } });
    if (!banner) {
      throw new NotFoundException({
        message: 'That banner does not exist.',
        code: 'BANNER_NOT_FOUND',
      });
    }
    return banner;
  }
}

/**
 * Refuses a banner that would render as nothing.
 *
 * The two placements carry their content differently — the hero *is* its image,
 * the strip is its text — so the requirement belongs here, per placement,
 * rather than as a NOT NULL that would force an image onto a line of text.
 */
export function assertRenderable(
  placement: BannerPlacement,
  imageUrl?: string,
  title?: string,
): void {
  if (placement === 'HOME_HERO' && !imageUrl) {
    throw new BadRequestException({
      message: 'A homepage hero needs an image.',
      code: 'BANNER_IMAGE_REQUIRED',
    });
  }

  if (placement === 'SITE_ANNOUNCEMENT' && !title) {
    throw new BadRequestException({
      message: 'An announcement needs a message to display.',
      code: 'BANNER_TITLE_REQUIRED',
    });
  }
}

export function parseWindow(startsAt?: string | null, endsAt?: string | null) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;

  if (start && end && end <= start) {
    throw new BadRequestException({
      message: 'The end of the schedule must come after its start.',
      code: 'BANNER_WINDOW_INVALID',
    });
  }

  return { startsAt: start, endsAt: end };
}

/**
 * `linkUrl` is rendered as an `href`, so it gets the same treatment as a social
 * link on the theme: anything that is not an http(s) URL or a site-relative
 * path is dropped. `javascript:` in particular would otherwise be stored XSS
 * that React's escaping does not stop, because an href is not text content.
 */
export function safeLink(url?: string): string | null {
  if (!url) return null;

  const trimmed = url.trim();
  if (trimmed === '') return null;

  // Site-relative, but not protocol-relative (`//evil.com` is off-site).
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return null;
}
