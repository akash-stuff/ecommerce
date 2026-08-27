import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { DiscountType } from '@prisma/client';
import { BooleanQuery } from '../../common/decorators/boolean-query';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateCouponDto {
  @IsString() @Length(3, 40) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @IsEnum(DiscountType) discountType!: DiscountType;

  /** Percent when PERCENTAGE, currency amount when FIXED. */
  @Type(() => Number) @IsNumber() @Min(0) discountValue!: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minOrderAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxDiscountAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) perCustomerLimit?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) productIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) categoryIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsISO8601() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCouponDto {
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minOrderAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxDiscountAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) perCustomerLimit?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) productIds?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) categoryIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsISO8601() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CouponQueryDto extends PaginationQueryDto {
  // A query string carries 'true', never true, so this needs the coercing
  // decorator rather than a bare @IsBoolean — which rejected every use of the
  // filter with "isActive must be a boolean value".
  @ApiPropertyOptional() @BooleanQuery() isActive?: boolean;
}

export class ApplyCouponDto {
  @IsString() @Length(3, 40) code!: string;
}
