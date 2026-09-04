import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { sanitiseCustomCss } from './css-sanitiser';
import { AuditService } from '../audit/audit.service';
import { ApplyTemplateDto, UpdateStorefrontDto, UpdateThemeDto } from './dto/theme.dto';
import { templateLook } from './template-look';
import { isStaffLoginEmail } from '../stores/staff-login-email';
import { RequestContextStore } from '../common/context/request-context';

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The editable theme, including the raw custom CSS the owner typed. */
  async get() {
    const store = await this.prisma.db.store.findFirst({
      select: {
        id: true,
        name: true,
        description: true,
        metaTitle: true,
        metaDescription: true,
        productDescription: true,
        isPublished: true,
        // The contact block. Selected here rather than fetched separately
        // because the settings form edits it in the same save as the name.
        email: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        template: { select: { id: true, slug: true, name: true } },
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
    if (dto.logoSize !== undefined) data.logoSize = dto.logoSize;
    if (dto.background !== undefined) data.background = dto.background;
    if (dto.backgroundFit !== undefined) data.backgroundFit = dto.backgroundFit;
    if (dto.backgroundImageUrl !== undefined) {
      data.backgroundImageUrl = dto.backgroundImageUrl || null;
    }
    if (dto.loginImageUrl !== undefined) data.loginImageUrl = dto.loginImageUrl || null;
    if (dto.loginMessage !== undefined) data.loginMessage = dto.loginMessage.trim() || null;
    if (dto.socialLinks !== undefined) {
      data.socialLinks = sanitiseSocialLinks(dto.socialLinks) as Prisma.InputJsonValue;
    }
    if (dto.homepageLayout !== undefined) {
      data.homepageLayout = dto.homepageLayout as Prisma.InputJsonValue;
    }
    if (dto.promises !== undefined) {
      /*
        Trimmed, and rows that are blank after trimming are dropped.

        The admin form always sends its full set of rows, so an untouched empty
        row arrives as `{ icon: 'truck', title: '', detail: '' }` rather than
        not arriving at all. Storing those would put empty tiles on the
        homepage; dropping them here means "cleared the fields" and "removed
        the row" do the same thing, which is what someone clearing the fields
        meant.
      */
      data.promises = dto.promises
        .map((row) => ({
          icon: row.icon,
          title: row.title.trim(),
          detail: row.detail.trim(),
        }))
        .filter((row) => row.title !== '' && row.detail !== '') as Prisma.InputJsonValue;
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

    void this.audit.record({
      action: 'theme.updated',
      entityType: 'Theme',
      entityId: store.id,
      changes: { fields: Object.keys(dto) },
    });

    // A store may predate its theme row, so upsert rather than assume.
    if (!store.theme) {
      return this.prisma.db.theme.create({
        data: { storeId: store.id, ...data } as unknown as Prisma.ThemeCreateInput,
      });
    }

    return this.prisma.db.theme.update({ where: { storeId: store.id }, data });
  }

  /**
   * The templates a shopkeeper may switch their own store to.
   *
   * Read unscoped because templates are platform assets shared by every tenant
   * — there is no tenant column to filter on. Retired ones are excluded here
   * for the same reason they are excluded from the store-creation picker: a
   * template taken out of the catalogue should not still be adoptable.
   */
  listTemplates() {
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
          layoutConfig: true,
        },
        orderBy: { name: 'asc' },
      }),
    );
  }

  /**
   * Switch an existing store to a different template.
   *
   * The template's values are *copied* into the store's theme rather than
   * referenced, exactly as they are at provisioning time. That keeps one rule
   * true everywhere: a live storefront never changes because someone edited a
   * template in the platform console.
   *
   * What is copied is only what a template actually describes — colours, type
   * and which homepage sections appear. A logo, a favicon and hand-written CSS
   * are the store's own work, and are kept by default.
   */
  async applyTemplate(dto: ApplyTemplateDto) {
    const store = await this.get();

    const template = await this.prisma.runUnscoped((db) =>
      db.template.findUnique({ where: { id: dto.templateId } }),
    );

    if (!template) {
      throw new NotFoundException({
        message: 'That template does not exist.',
        code: 'TEMPLATE_NOT_FOUND',
      });
    }

    // A retired template is out of the catalogue, so it must not be adoptable
    // through a hand-made request either.
    if (!template.isActive) {
      throw new BadRequestException({
        message: 'That template has been retired and can no longer be applied.',
        code: 'TEMPLATE_RETIRED',
      });
    }

    /**
     * The stored Json is validated on the way *in*, but this row may predate a
     * change to either allowlist, so it is filtered again on the way out — by
     * `templateLook`, the same reader provisioning and the seed use.
     */
    const look = templateLook(template.defaultTheme, template.layoutConfig);

    const data: Prisma.ThemeUncheckedUpdateInput = {};
    if (look.primaryColor !== undefined) data.primaryColor = look.primaryColor;
    if (look.secondaryColor !== undefined) data.secondaryColor = look.secondaryColor;
    if (look.accentColor !== undefined) data.accentColor = look.accentColor;
    if (look.bodyFont !== undefined) data.bodyFont = look.bodyFont;
    if (look.headingFont !== undefined) data.headingFont = look.headingFont;
    if (look.background !== undefined) data.background = look.background;
    if (look.logoSize !== undefined) data.logoSize = look.logoSize;

    /**
     * A template's background replaces a *preset*, not an uploaded image.
     *
     * Clearing a custom background here would delete artwork the shopkeeper
     * chose, which is the same class of loss as clearing their logo — and they
     * were not asked. Switching template while a custom image is set therefore
     * changes the preset underneath it and leaves the image on top; removing the
     * image in Appearance then reveals the new template's background.
     */
    if (look.homepageLayout !== undefined) {
      data.homepageLayout = look.homepageLayout as Prisma.InputJsonValue;
    }

    // Compared against `false` rather than tested for falsiness, so only an
    // explicit opt-out clears anything. An omitted flag must keep the store's
    // own work, which is what a caller that has not thought about it sends.
    if (dto.keepLogo === false) {
      data.logoUrl = null;
      data.faviconUrl = null;
    }
    if (dto.keepCustomCss === false) data.customCss = null;

    await this.prisma.db.store.update({
      where: { id: store.id },
      data: { templateId: template.id },
    });

    const updated = store.theme
      ? await this.prisma.db.theme.update({ where: { storeId: store.id }, data })
      : await this.prisma.db.theme.create({
          data: { storeId: store.id, ...data } as unknown as Prisma.ThemeCreateInput,
        });

    void this.audit.record({
      action: 'theme.templateApplied',
      entityType: 'Store',
      entityId: store.id,
      changes: {
        template: template.slug,
        keptLogo: dto.keepLogo ?? true,
        keptCustomCss: dto.keepCustomCss ?? true,
      },
    });

    return updated;
  }

  async updateStorefront(dto: UpdateStorefrontDto) {
    const data = { ...dto } as Prisma.StoreUncheckedUpdateInput;

    /**
     * Blank means "remove it", not "store an empty string".
     *
     * The shared product description is rendered inside its own bordered block
     * on every product page, and the storefront decides whether to draw that
     * block by asking whether the value is present. An empty string is present,
     * so clearing the field would leave an empty box under every product.
     */
    if (dto.productDescription !== undefined) {
      data.productDescription = dto.productDescription.trim() || null;
    }

    /**
     * The same rule for the contact block, and for the same reason: these are
     * nullable columns whose consumers ask "is there a value" before they print
     * a line. An empty string is a value, so a cleared phone number would put an
     * empty contact line on an invoice rather than removing it.
     *
     * The email is deliberately not in that list. It is NOT NULL, the storefront
     * footer and every order email print it unconditionally, and the dto refuses
     * a blank one before this code ever runs.
     */
    const clearable = [
      'phone',
      'whatsappNumber',
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'postalCode',
    ] as const;

    for (const field of clearable) {
      const value = dto[field];
      if (value !== undefined) data[field] = value.trim() || null;
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim();

      /**
       * Refused when it is an address someone signs in with.
       *
       * This one is printed in the storefront footer and at the foot of every
       * order email, so setting it to a login publishes half a credential to
       * every shopper — and points phishing at the account that can change
       * where the money goes. Caught here rather than in the DTO because it
       * needs the store's staff list, which validation cannot see.
       */
      if (await isStaffLoginEmail(this.prisma, RequestContextStore.requireTenantId(), email)) {
        throw new BadRequestException({
          message:
            'That address is used to sign in to this store, and shoppers can see this one. Use a public address such as info@ or hello@ instead.',
          code: 'PUBLIC_EMAIL_IS_A_LOGIN',
        });
      }

      data.email = email;
    }

    return this.get().then((store) =>
      this.prisma.db.store.update({ where: { id: store.id }, data }),
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
