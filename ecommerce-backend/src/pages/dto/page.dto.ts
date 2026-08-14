import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { MAX_PAGE_CONTENT_LENGTH } from '../html-sanitiser';

export class CreatePageDto {
  @IsString() @Length(1, 200) title!: string;

  @ApiPropertyOptional({ description: 'Derived from the title when omitted' })
  @IsOptional() @IsString() @MaxLength(120) slug?: string;

  @ApiPropertyOptional({ description: 'HTML; anything executable is stripped on save' })
  @IsString() @MaxLength(MAX_PAGE_CONTENT_LENGTH) content!: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) metaDescription?: string;
}

export class UpdatePageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(MAX_PAGE_CONTENT_LENGTH) content?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPublished?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) metaDescription?: string;
}

export class PageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPublished?: boolean;
}
