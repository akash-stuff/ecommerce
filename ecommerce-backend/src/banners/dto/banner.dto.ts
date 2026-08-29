import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsUrlOrEmpty } from '../../common/decorators/is-url-or-empty';
import { IsHexColourOrEmpty } from '../../common/decorators/is-hex-colour-or-empty';
import { ALLOWED_FONTS } from '../../theme/dto/theme.dto';

/**
 * Where a banner appears. Closed, and short on purpose: every value here is a
 * slot the storefront actually renders. Offering a placement nothing draws
 * would let a shopkeeper schedule a banner, see it saved, and never see it —
 * which is the "no fake features" rule failing in the most confusing way.
 */
export const BANNER_PLACEMENTS = ['HOME_HERO', 'SITE_ANNOUNCEMENT'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

/**
 * How large the announcement strip's text is. Three named steps rather than a
 * number: a free pixel value lets a shopkeeper set 48px on a strip that sits
 * above every page on the site, and there is no way back from that except
 * finding this form again.
 */
export const ANNOUNCEMENT_FONT_SIZES = ['sm', 'md', 'lg'] as const;
export type AnnouncementFontSize = (typeof ANNOUNCEMENT_FONT_SIZES)[number];

/**
 * The styling a banner may carry, mixed into both the create and the update
 * DTO. Every field is optional and clearable: cleared means "use the store's
 * brand colour and body font", which is what a strip looked like before these
 * controls existed.
 */
export class BannerStyleDto {
  @ApiPropertyOptional({ description: 'Strip background. Empty to use the brand colour.' })
  @IsHexColourOrEmpty() backgroundColor?: string;

  @ApiPropertyOptional({ description: 'Text colour. Empty for white.' })
  @IsHexColourOrEmpty() textColor?: string;

  @ApiPropertyOptional({
    enum: ALLOWED_FONTS,
    description: "A font from the theme allowlist. Empty for the store's body font.",
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @IsIn(ALLOWED_FONTS as unknown as string[])
  fontFamily?: string;

  @ApiPropertyOptional({ enum: ANNOUNCEMENT_FONT_SIZES })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @IsIn(ANNOUNCEMENT_FONT_SIZES as unknown as string[])
  fontSize?: string;
}

export class CreateBannerDto extends BannerStyleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subtitle?: string;

  /** Required for HOME_HERO, optional for a text-only strip. See the service. */
  @ApiPropertyOptional({ description: 'Absolute URL of the image' })
  @IsUrlOrEmpty() imageUrl?: string;

  @ApiPropertyOptional({ description: 'Where clicking it goes. Relative paths allowed.' })
  @IsOptional() @IsString() @MaxLength(500) linkUrl?: string;

  @ApiPropertyOptional({ enum: BANNER_PLACEMENTS, default: 'HOME_HERO' })
  @IsOptional() @IsIn(BANNER_PLACEMENTS as unknown as string[]) placement?: BannerPlacement;

  @ApiPropertyOptional({ description: 'Lower sorts first' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ description: 'Hidden until this moment' })
  @IsOptional() @IsISO8601() startsAt?: string;

  @ApiPropertyOptional({ description: 'Hidden after this moment' })
  @IsOptional() @IsISO8601() endsAt?: string;
}

export class UpdateBannerDto extends BannerStyleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subtitle?: string;
  @ApiPropertyOptional() @IsUrlOrEmpty() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) linkUrl?: string;

  @ApiPropertyOptional({ enum: BANNER_PLACEMENTS })
  @IsOptional() @IsIn(BANNER_PLACEMENTS as unknown as string[]) placement?: BannerPlacement;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() endsAt?: string;
}

export class BannerQueryDto {
  @ApiPropertyOptional({ enum: BANNER_PLACEMENTS })
  @IsOptional() @IsIn(BANNER_PLACEMENTS as unknown as string[]) placement?: BannerPlacement;
}
