import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class AddCartItemDto {
  @IsUUID() productId!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() variantId?: string;

  /** Capped: a cart line is not the place to order a thousand of anything. */
  @Type(() => Number) @IsInt() @Min(1) @Max(999) quantity = 1;
}

export class UpdateCartItemDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(999) quantity!: number;
}

/** Optional shipping context so the cart can show a real total at checkout. */
export class CartViewQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() shippingMethodId?: string;

  @ApiPropertyOptional({ description: 'Include the COD fee in the total' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  cod?: boolean;
}

export class CartShippingQuoteDto {
  @IsString() @Length(2, 2) country!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
}
