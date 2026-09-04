import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsUrlOrEmpty } from '../../common/decorators/is-url-or-empty';
import { MAX_CUSTOM_CSS_LENGTH } from '../css-sanitiser';
import {
  BACKGROUND_FITS,
  BACKGROUND_PRESETS,
  LOGO_SIZES,
} from '../backgrounds';

/**
 * Fonts are an allowlist rather than free text: the storefront loads them from
 * Google Fonts by name, so an arbitrary string becomes an arbitrary request URL.
 */
export const ALLOWED_FONTS = [
  'Inter',
  'Playfair Display',
  'Fraunces',
  'Cormorant',
  'Lora',
  'Poppins',
  'Roboto',
  'Work Sans',
  'DM Sans',
  'Space Grotesk',
] as const;

export const HOMEPAGE_SECTIONS = [
  'hero',
  'promise',
  'featured',
  'categories',
  'newArrivals',
  'newsletter',
] as const;

/**
 * The icons a promise row may use.
 *
 * An allowlist, not free text, for the same reason the fonts above are: the
 * storefront maps this to a component, and an unknown name would render as
 * nothing at all — a row with a hole where its icon should be. Chosen to cover
 * what a shop actually promises rather than to be a complete icon set; a
 * shopkeeper picking from six is choosing, and one picking from six hundred is
 * shopping.
 */
export const PROMISE_ICONS = [
  'truck',
  'clock',
  'rupee',
  'shield',
  'chat',
  'refresh',
] as const;

/** The most a strip can hold before it stops reading as a row. */
export const MAX_PROMISES = 4;

/**
 * One tile in the homepage delivery-and-payment strip.
 *
 * Both text fields are plain and short. Short because the strip is a row of
 * four on a desktop and a long `detail` wraps to three lines and breaks the
 * grid; plain because this is rendered as text — a shopkeeper must not be able
 * to put markup on the homepage.
 */
export class PromiseRowDto {
  @ApiProperty({ enum: PROMISE_ICONS })
  @IsIn(PROMISE_ICONS as unknown as string[])
  icon!: string;

  @ApiProperty({ description: 'The bold line, e.g. "Free delivery"' })
  @IsString() @Length(1, 40) title!: string;

  @ApiProperty({ description: 'The line under it, e.g. "On orders over ₹999"' })
  @IsString() @Length(1, 80) detail!: string;
}

export class UpdateThemeDto {
  @ApiPropertyOptional({ description: 'Hex colour, e.g. #141414' })
  @IsOptional() @IsHexColor() primaryColor?: string;

  @ApiPropertyOptional() @IsOptional() @IsHexColor() secondaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() accentColor?: string;

  @ApiPropertyOptional({ enum: ALLOWED_FONTS })
  @IsOptional() @IsIn(ALLOWED_FONTS as unknown as string[]) bodyFont?: string;

  @ApiPropertyOptional({ enum: ALLOWED_FONTS })
  @IsOptional() @IsIn(ALLOWED_FONTS as unknown as string[]) headingFont?: string;

  @ApiPropertyOptional({ description: 'Absolute URL, or empty to remove' })
  @IsUrlOrEmpty() logoUrl?: string;

  @ApiPropertyOptional() @IsUrlOrEmpty() faviconUrl?: string;

  @ApiPropertyOptional({ enum: LOGO_SIZES, description: 'Header logo height' })
  @IsOptional() @IsIn(LOGO_SIZES as unknown as string[]) logoSize?: string;

  /**
   * A name, never CSS. The storefront decides what each preset looks like, and
   * draws it from this store's own colours — see theme/backgrounds.ts.
   */
  @ApiPropertyOptional({ enum: BACKGROUND_PRESETS })
  @IsOptional() @IsIn(BACKGROUND_PRESETS as unknown as string[]) background?: string;

  @ApiPropertyOptional({ description: 'Overrides the preset. Empty to remove.' })
  @IsUrlOrEmpty() backgroundImageUrl?: string;

  @ApiPropertyOptional({ enum: BACKGROUND_FITS })
  @IsOptional() @IsIn(BACKGROUND_FITS as unknown as string[]) backgroundFit?: string;

  @ApiPropertyOptional({ description: 'Artwork beside the shopper sign-in form' })
  @IsUrlOrEmpty() loginImageUrl?: string;

  /**
   * Plain text, and short. It is rendered as text rather than markup — a store
   * owner typing a greeting must not be able to put a tag on a page every
   * shopper sees.
   */
  @ApiPropertyOptional({ description: 'A short line shown on the sign-in page' })
  @IsOptional() @IsString() @MaxLength(160) loginMessage?: string;

  @ApiPropertyOptional({ description: 'Platform name to profile URL' })
  @IsOptional() @IsObject() socialLinks?: Record<string, string>;

  @ApiPropertyOptional({ enum: HOMEPAGE_SECTIONS, isArray: true })
  @IsOptional() @IsArray() @IsIn(HOMEPAGE_SECTIONS as unknown as string[], { each: true })
  homepageLayout?: string[];

  /**
   * The homepage promise strip.
   *
   * An empty array is meaningful and is not the same as omitting the field:
   * sending `[]` clears the authored strip and hands the section back to the
   * one derived from the store's shipping methods, which is how a shopkeeper
   * undoes this without having to retype what the shipping tables already say.
   */
  @ApiPropertyOptional({ type: [PromiseRowDto], maxItems: MAX_PROMISES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROMISES)
  @ValidateNested({ each: true })
  @Type(() => PromiseRowDto)
  promises?: PromiseRowDto[];

  @ApiPropertyOptional({ description: 'Refused if it contains anything executable' })
  @IsOptional() @IsString() @MaxLength(MAX_CUSTOM_CSS_LENGTH) customCss?: string;
}

/** Storefront identity that sits next to the theme rather than inside it. */
export class UpdateStorefrontDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) metaDescription?: string;

  /**
   * Shown under every product's own description. Plain text and capped: it is
   * rendered as words on a page a shopper reads, not as markup.
   */
  @ApiPropertyOptional({ description: 'Shown below every product description' })
  @IsOptional() @IsString() @MaxLength(2000) productDescription?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;

  // ---------------------------------------------------------------------------
  // HOW A CUSTOMER REACHES THE SHOP
  //
  // These were editable nowhere. The columns existed and three subsystems read
  // them — the storefront footer prints the email under every page, every
  // transactional email signs off with it ("Questions? Contact ..."), and an
  // invoice falls back to it and to the address when the invoicing form is
  // blank — but the only value they ever held was the one typed by whoever
  // created the tenant. A shopkeeper who changed premises or moved off a
  // personal address had no way to say so.
  // ---------------------------------------------------------------------------

  /**
   * Required, not clearable, and the reason is on the page: this address is
   * printed in the storefront footer and on the foot of every order email. An
   * empty string here would publish a shop with no way to reach it, so it is
   * refused rather than stored — which is also what the NOT NULL column says.
   */
  @ApiPropertyOptional({ description: 'Public contact address, shown in the footer and on every email' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address. Shoppers see it in your footer and on every order email.' })
  @MaxLength(200)
  email?: string;

  /**
   * Optional and clearable, unlike the email. `Length` is skipped for the empty
   * string on purpose: emptying the field is how a shop removes a number it no
   * longer answers, and a bare `@Length(5, 20)` would reject exactly that.
   * Five to twenty is the range checkout already applies to a shopper's number.
   */
  @ApiPropertyOptional({ description: 'Public contact number. Empty to remove.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @IsString()
  @Length(5, 20, { message: 'A phone number is between 5 and 20 characters.' })
  phone?: string;

  /**
   * The number the storefront's WhatsApp button opens a chat with.
   *
   * Separate from `phone`, and opt-in: a shop's contact number is often a
   * landline, and a button that opens a chat nobody can answer is worse than no
   * button. Clearable the same way — emptying it takes the button off the
   * storefront, which is the only way to remove it.
   */
  @ApiPropertyOptional({ description: 'WhatsApp number for the storefront chat button. Empty to remove.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @IsString()
  @Length(8, 20, { message: 'Enter the number with its country code, for example +91 98765 43210.' })
  whatsappNumber?: string;

  @ApiPropertyOptional({ description: 'Trading address. Falls back to this on invoices.' })
  @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(12) postalCode?: string;
}

/**
 * Applying a template to a store that already exists.
 *
 * `keepLogo` defaults to true and is the whole reason this is not a plain
 * theme update: a shopkeeper trying on a different look almost never means
 * "also throw away the logo I uploaded", and losing it is the kind of mistake
 * that is only noticed once a customer sees the storefront.
 */
export class ApplyTemplateDto {
  @ApiProperty({ description: 'Id of an active template' })
  @IsUUID() templateId!: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Keep the logo and favicon already uploaded',
  })
  @IsOptional() @IsBoolean() keepLogo?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: "Keep the store's own custom CSS",
  })
  @IsOptional() @IsBoolean() keepCustomCss?: boolean;
}
