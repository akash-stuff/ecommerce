import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { BooleanQuery } from '../../common/decorators/boolean-query';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ProductVariantInputDto {
  @ApiProperty() @IsString() @MaxLength(64) sku!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiPropertyOptional({ example: { Size: 'M', Color: 'Black' } })
  @IsOptional() optionValues?: Record<string, string>;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) compareAtPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) stock?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
}

/**
 * Note the absence of a `tenantId` field. It is never accepted from a client;
 * the service takes it from the request context.
 */
export class CreateProductDto {
  @ApiProperty() @IsString() @MaxLength(200) name!: string;
  @ApiProperty() @IsString() @MaxLength(64) sku!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(220) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) shortDescription?: string;

  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) compareAtPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) taxRate?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) stock?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) lowStockThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackInventory?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];

  @ApiPropertyOptional({ type: [ProductVariantInputDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => ProductVariantInputDto)
  variants?: ProductVariantInputDto[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) weightGrams?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() metaTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() metaDescription?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
  @ApiPropertyOptional() @BooleanQuery() inStock?: boolean;
  @ApiPropertyOptional() @BooleanQuery() featured?: boolean;
}
