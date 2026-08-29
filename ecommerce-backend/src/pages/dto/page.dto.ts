import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BooleanQuery } from '../../common/decorators/boolean-query';
import { IsUrlOrEmpty } from '../../common/decorators/is-url-or-empty';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { MAX_PAGE_CONTENT_LENGTH } from '../html-sanitiser';

/** How many images one page may carry. A gallery, not a media library. */
export const MAX_PAGE_IMAGES = 12;

/**
 * One image in a page's gallery.
 *
 * The caption is plain text and is rendered as text, never as markup — the
 * page's `content` is the one field on this form that may contain HTML, and it
 * is sanitised on the way in and again on the way out.
 */
export class PageImageDto {
  @ApiPropertyOptional({ description: 'Absolute URL of the image' })
  @IsUrlOrEmpty() url!: string;

  @ApiPropertyOptional({ description: 'Shown under the image. Plain text.' })
  @IsOptional() @IsString() @MaxLength(200) caption?: string;
}

export class CreatePageDto {
  @IsString() @Length(1, 200) title!: string;

  @ApiPropertyOptional({ description: 'Derived from the title when omitted' })
  @IsOptional() @IsString() @MaxLength(120) slug?: string;

  @ApiPropertyOptional({ description: 'HTML; anything executable is stripped on save' })
  @IsString() @MaxLength(MAX_PAGE_CONTENT_LENGTH) content!: string;

  @ApiPropertyOptional({ description: 'Artwork behind the heading. Empty to remove.' })
  @IsUrlOrEmpty() backgroundImageUrl?: string;

  @ApiPropertyOptional({ type: [PageImageDto], description: 'Gallery under the content' })
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PAGE_IMAGES)
  @ValidateNested({ each: true }) @Type(() => PageImageDto)
  images?: PageImageDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) metaDescription?: string;
}

export class UpdatePageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX_PAGE_CONTENT_LENGTH) content?: string;

  @ApiPropertyOptional({ description: 'Empty to remove' })
  @IsUrlOrEmpty() backgroundImageUrl?: string;

  @ApiPropertyOptional({ type: [PageImageDto], description: 'Replaces the whole gallery' })
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PAGE_IMAGES)
  @ValidateNested({ each: true }) @Type(() => PageImageDto)
  images?: PageImageDto[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) metaDescription?: string;
}

export class PageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Omit for both drafts and published pages' })
  @BooleanQuery()
  isPublished?: boolean;
}
