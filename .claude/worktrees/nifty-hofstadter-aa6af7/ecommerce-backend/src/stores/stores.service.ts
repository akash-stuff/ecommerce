import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StoreConfigDto, StoreThemeDto } from './dto/store.dto';
import { sanitiseCustomCss } from '../theme/css-sanitiser';

/**
 * Serves the branding payload the storefront fetches before it renders
 * anything. Like every other tenant-scoped module, no method mentions
 * tenantId — the Prisma extension supplies it from the resolved hostname.
 */
@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * There is exactly one store per tenant (Store.tenantId is unique), so the
   * scoped findFirst is already the right store. An unpublished store is
   * treated as absent: a tenant that has not gone live yet should look no
   * different from a hostname that belongs to nobody.
   */
  async getConfig(): Promise<StoreConfigDto> {
    const store = await this.prisma.db.store.findFirst({
      where: { isPublished: true },
      include: {
        theme: true,
        template: { select: { slug: true, name: true } },
      },
    });

    if (!store) {
      throw new NotFoundException({
        message: 'No store is configured for this address.',
        code: 'STORE_NOT_FOUND',
      });
    }

    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      description: store.description,
      currency: store.currency,
      email: store.email,
      phone: store.phone,
      metaTitle: store.metaTitle,
      metaDescription: store.metaDescription,
      template: store.template ? { slug: store.template.slug, name: store.template.name } : null,
      theme: toThemeDto(store.theme),
    };
  }
}

/**
 * Sanitised again on the way out, even though it was sanitised on the way in.
 * The stored value should already be safe; re-checking means a row written by
 * an older build, a migration or a direct database edit still cannot reach a
 * `<style>` block with a breakout in it.
 */
function safeCustomCss(css: string | null | undefined): string | null {
  if (!css) return null;
  const { css: cleaned, rejections } = sanitiseCustomCss(css);
  return rejections.length === 0 ? cleaned || null : null;
}

type ThemeRow = {
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  bodyFont: string;
  headingFont: string;
  socialLinks: unknown;
  homepageLayout: unknown;
  customCss: string | null;
} | null;

/**
 * A store can exist without a theme row. Rather than let the storefront crash
 * on a null, fall back to the same neutral defaults the schema declares.
 */
function toThemeDto(theme: ThemeRow): StoreThemeDto {
  return {
    logoUrl: theme?.logoUrl ?? null,
    faviconUrl: theme?.faviconUrl ?? null,
    primaryColor: theme?.primaryColor ?? '#111111',
    secondaryColor: theme?.secondaryColor ?? '#6B7280',
    bodyFont: theme?.bodyFont ?? 'Inter',
    headingFont: theme?.headingFont ?? 'Inter',
    socialLinks: asStringMap(theme?.socialLinks),
    homepageLayout: asStringArray(theme?.homepageLayout),
    customCss: safeCustomCss(theme?.customCss),
  };
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string]),
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
