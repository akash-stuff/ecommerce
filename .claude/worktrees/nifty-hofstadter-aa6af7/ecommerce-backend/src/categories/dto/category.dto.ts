import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateCategoryDto {
  @IsString() @MaxLength(120) name!: string;

  /** Derived from the name when omitted. Unique per tenant, not globally. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) slug?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;

  /** Must be a category of the same tenant; the scoped client enforces it. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metaDescription?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;

  /** Null detaches the category and makes it a root. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsUUID() parentId?: string | null;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metaDescription?: string;
}

export class CategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only children of this category' })
  @IsOptional() @IsUUID() parentId?: string;

  @ApiPropertyOptional({ description: 'Only root categories' })
  @IsOptional() @Type(() => Boolean) @IsBoolean() rootOnly?: boolean;

  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
}
