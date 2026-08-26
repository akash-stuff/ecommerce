import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import { MAX_CUSTOM_CSS_LENGTH } from '../css-sanitiser';

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
  'featured',
  'categories',
  'newArrivals',
  'newsletter',
] as const;

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
  @IsOptional() @IsUrl({ require_tld: false }) logoUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) faviconUrl?: string;

  @ApiPropertyOptional({ description: 'Platform name to profile URL' })
  @IsOptional() @IsObject() socialLinks?: Record<string, string>;

  @ApiPropertyOptional({ enum: HOMEPAGE_SECTIONS, isArray: true })
  @IsOptional() @IsArray() @IsIn(HOMEPAGE_SECTIONS as unknown as string[], { each: true })
  homepageLayout?: string[];

  @ApiPropertyOptional({ description: 'Refused if it contains anything executable' })
  @IsOptional() @IsString() @MaxLength(MAX_CUSTOM_CSS_LENGTH) customCss?: string;
}

/** Storefront identity that sits next to the theme rather than inside it. */
export class UpdateStorefrontDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) metaDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
}
