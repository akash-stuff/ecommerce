import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Where a banner appears. Closed, and short on purpose: every value here is a
 * slot the storefront actually renders. Offering a placement nothing draws
 * would let a shopkeeper schedule a banner, see it saved, and never see it —
 * which is the "no fake features" rule failing in the most confusing way.
 */
export const BANNER_PLACEMENTS = ['HOME_HERO', 'SITE_ANNOUNCEMENT'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export class CreateBannerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subtitle?: string;

  /** Required for HOME_HERO, optional for a text-only strip. See the service. */
  @ApiPropertyOptional({ description: 'Absolute URL of the image' })
  @IsOptional() @IsUrl({ require_tld: false }) imageUrl?: string;

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

export class UpdateBannerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) imageUrl?: string;
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
