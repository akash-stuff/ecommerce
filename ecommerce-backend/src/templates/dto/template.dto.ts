import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ALLOWED_FONTS, HOMEPAGE_SECTIONS } from '../../theme/dto/theme.dto';

/**
 * A template's default theme seeds every store created from it, so it is held
 * to exactly the same allowlists as a tenant's own theme edits. The font list
 * is the reason this is not a free-form Json blob: the storefront requests
 * fonts from Google Fonts *by name*, so an unvalidated value here would become
 * an arbitrary request URL on every store the template ever creates.
 */
export class TemplateThemeDto {
  @ApiPropertyOptional({ description: 'Hex colour, e.g. #141414' })
  @IsOptional() @IsHexColor() primaryColor?: string;

  @ApiPropertyOptional() @IsOptional() @IsHexColor() secondaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() accentColor?: string;

  @ApiPropertyOptional({ enum: ALLOWED_FONTS })
  @IsOptional() @IsIn(ALLOWED_FONTS as unknown as string[]) bodyFont?: string;

  @ApiPropertyOptional({ enum: ALLOWED_FONTS })
  @IsOptional() @IsIn(ALLOWED_FONTS as unknown as string[]) headingFont?: string;
}

/**
 * Sections the storefront knows how to render. A template naming anything else
 * would produce a homepage with a silent hole in it, so the list is closed
 * rather than advisory.
 */
export class TemplateLayoutDto {
  @ApiPropertyOptional({ enum: HOMEPAGE_SECTIONS, isArray: true })
  @IsOptional() @IsArray() @IsIn(HOMEPAGE_SECTIONS as unknown as string[], { each: true })
  sections?: string[];
}

export class CreateTemplateDto {
  @IsString() @Length(2, 60) name!: string;

  @ApiPropertyOptional({ description: 'Derived from the name when omitted' })
  @IsOptional() @IsString() @Length(2, 60) slug?: string;

  @IsString() @Length(2, 40) category!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;

  @ApiPropertyOptional({ description: 'Absolute URL of the gallery thumbnail' })
  @IsOptional() @IsUrl({ require_tld: false }) previewImage?: string;

  @ApiPropertyOptional({ type: TemplateThemeDto })
  @IsOptional() @ValidateNested() @Type(() => TemplateThemeDto)
  defaultTheme?: TemplateThemeDto;

  @ApiPropertyOptional({ type: TemplateLayoutDto })
  @IsOptional() @ValidateNested() @Type(() => TemplateLayoutDto)
  layoutConfig?: TemplateLayoutDto;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * `slug` is absent deliberately. Stores reference a template by id, but the
 * slug is what seeds and documentation name, so letting it change turns a
 * stable identifier into a moving one for no real gain.
 */
export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 40) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) previewImage?: string;

  @ApiPropertyOptional({ type: TemplateThemeDto })
  @IsOptional() @ValidateNested() @Type(() => TemplateThemeDto)
  defaultTheme?: TemplateThemeDto;

  @ApiPropertyOptional({ type: TemplateLayoutDto })
  @IsOptional() @ValidateNested() @Type(() => TemplateLayoutDto)
  layoutConfig?: TemplateLayoutDto;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
