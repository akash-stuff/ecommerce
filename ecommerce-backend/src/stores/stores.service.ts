import { BRAND_DEFAULTS } from '../theme/brand-defaults';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { isStaffLoginEmail } from './staff-login-email';
import { resolveStorePromises, toPromiseRows } from './store-promises';
import { StoreConfigDto, StoreThemeDto } from './dto/store.dto';
import { sanitiseCustomCss } from '../theme/css-sanitiser';
import {
  BACKGROUND_FITS,
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND,
  DEFAULT_LOGO_SIZE,
  LOGO_SIZES,
} from '../theme/backgrounds';

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

    /**
     * Withheld when it is a sign-in address.
     *
     * The column is meant to hold the shop's public "info" address, but nothing
     * stopped it being filled with the owner's login, and on a store where that
     * happened the footer was publishing half a credential to every visitor.
     * Printing nothing is the safe failure: the shopkeeper is told in Settings
     * and can put a real contact address in, and until they do the storefront
     * simply has no email on it.
     */
    const publicEmail = (await isStaffLoginEmail(this.prisma, store.tenantId, store.email))
      ? null
      : store.email;

    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      description: store.description,
      currency: store.currency,
      email: publicEmail,
      phone: store.phone,
      whatsappNumber: store.whatsappNumber,
      metaTitle: store.metaTitle,
      metaDescription: store.metaDescription,
      productDescription: store.productDescription,
      template: store.template ? { slug: store.template.slug, name: store.template.name } : null,
      theme: toThemeDto(store.theme),
      /**
       * Finished text, not raw settings.
       *
       * The tiles are worded here rather than in the browser because a shop can
       * now write its own, and those arrive as finished strings — wording the
       * derived ones client-side would leave two copies of the same sentence
       * that drift apart the first time either is edited.
       *
       * Sent with the config rather than from an endpoint of its own: the
       * storefront already fetches this once per visit and holds it, so a
       * second round trip would buy nothing but a slower first paint.
       */
      promises: toPromiseRows(
        store.theme?.promises,
        await resolveStorePromises(this.prisma),
        store.currency,
      ),
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
  logoSize: string;
  background: string;
  backgroundImageUrl: string | null;
  backgroundFit: string;
  loginImageUrl: string | null;
  loginMessage: string | null;
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
    primaryColor: theme?.primaryColor ?? BRAND_DEFAULTS.PRIMARY,
    secondaryColor: theme?.secondaryColor ?? BRAND_DEFAULTS.SECONDARY,
    bodyFont: theme?.bodyFont ?? 'Inter',
    headingFont: theme?.headingFont ?? 'Inter',
    /**
     * Re-checked against the allowlists rather than passed through.
     *
     * A row written before a preset was renamed — or edited directly — would
     * otherwise name a background the storefront cannot draw, and the page
     * would render with no surface colour at all. Falling back to the default
     * is a plain page, which is a recoverable outcome.
     */
    logoSize: oneOf(theme?.logoSize, LOGO_SIZES, DEFAULT_LOGO_SIZE),
    background: oneOf(theme?.background, BACKGROUND_PRESETS, DEFAULT_BACKGROUND),
    backgroundImageUrl: theme?.backgroundImageUrl ?? null,
    backgroundFit: oneOf(theme?.backgroundFit, BACKGROUND_FITS, 'cover'),
    loginImageUrl: theme?.loginImageUrl ?? null,
    loginMessage: theme?.loginMessage ?? null,
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

/** The value when the allowlist recognises it, the default when it does not. */
function oneOf<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
