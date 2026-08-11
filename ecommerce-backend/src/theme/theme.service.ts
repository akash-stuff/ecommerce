import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { sanitiseCustomCss } from './css-sanitiser';
import { UpdateStorefrontDto, UpdateThemeDto } from './dto/theme.dto';

@Injectable()
export class ThemeService {
  constructor(private readonly prisma: PrismaService) {}

  /** The editable theme, including the raw custom CSS the owner typed. */
  async get() {
    const store = await this.prisma.db.store.findFirst({
      select: {
        id: true,
        name: true,
        description: true,
        metaTitle: true,
        metaDescription: true,
        isPublished: true,
        template: { select: { slug: true, name: true } },
        theme: true,
      },
    });

    if (!store) {
      throw new NotFoundException({
        message: 'This tenant has no store yet.',
        code: 'STORE_NOT_FOUND',
      });
    }

    return store;
  }

  /**
   * Custom CSS is sanitised on write, so what is stored is already safe to
   * render. Checking only at render time would leave a dangerous value sitting
   * in the database waiting for the one code path that forgets.
   */
  async update(dto: UpdateThemeDto) {
    const store = await this.get();

    const data: Prisma.ThemeUncheckedUpdateInput = {};

    if (dto.primaryColor !== undefined) data.primaryColor = dto.primaryColor;
    if (dto.secondaryColor !== undefined) data.secondaryColor = dto.secondaryColor;
    if (dto.accentColor !== undefined) data.accentColor = dto.accentColor;
    if (dto.bodyFont !== undefined) data.bodyFont = dto.bodyFont;
    if (dto.headingFont !== undefined) data.headingFont = dto.headingFont;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl || null;
    if (dto.faviconUrl !== undefined) data.faviconUrl = dto.faviconUrl || null;
    if (dto.socialLinks !== undefined) {
      data.socialLinks = sanitiseSocialLinks(dto.socialLinks) as Prisma.InputJsonValue;
    }
    if (dto.homepageLayout !== undefined) {
      data.homepageLayout = dto.homepageLayout as Prisma.InputJsonValue;
    }

    if (dto.customCss !== undefined) {
      const { css, rejections } = sanitiseCustomCss(dto.customCss);

      if (rejections.length > 0) {
        throw new BadRequestException({
          message: 'That custom CSS contains something that cannot be published.',
          code: 'UNSAFE_CUSTOM_CSS',
          details: rejections.map((r) => `${r.pattern} — ${r.reason}`),
        });
      }

      data.customCss = css || null;
    }

    // A store may predate its theme row, so upsert rather than assume.
    if (!store.theme) {
      return this.prisma.db.theme.create({
        data: { storeId: store.id, ...data } as unknown as Prisma.ThemeCreateInput,
      });
    }

    return this.prisma.db.theme.update({ where: { storeId: store.id }, data });
  }

  updateStorefront(dto: UpdateStorefrontDto) {
    return this.get().then((store) =>
      this.prisma.db.store.update({
        where: { id: store.id },
        data: dto as Prisma.StoreUpdateInput,
      }),
    );
  }
}

/**
 * Social links end up as `href` on the storefront, so the same schemes that are
 * dangerous in CSS are dangerous here. Anything not http(s) is dropped rather
 * than refused — a bad link is not worth failing an otherwise valid save.
 */
function sanitiseSocialLinks(links: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [platform, url] of Object.entries(links)) {
    if (typeof url !== 'string' || url.trim() === '') continue;
    if (!/^https?:\/\//i.test(url.trim())) continue;
    if (platform.length > 40) continue;
    safe[platform] = url.trim();
  }

  return safe;
}
