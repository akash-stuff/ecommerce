import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class OrderAddressDto {
  @IsString() @Length(2, 120) fullName!: string;
  @IsString() @Length(5, 20) phone!: string;
  @IsString() @Length(3, 200) line1!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) line2?: string;
  @IsString() @Length(2, 80) city!: string;
  @IsString() @Length(2, 80) state!: string;
  @IsString() @Length(2, 2) country!: string;
  @IsString() @Length(3, 12) postalCode!: string;
}

/**
 * Notice what this does not contain: prices, totals, or a tenant id. The client
 * says what it wants and where to send it; the server decides what it costs.
 */
export class CheckoutDto {
  @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(5, 20) phone?: string;

  @ValidateNested() @Type(() => OrderAddressDto) shippingAddress!: OrderAddressDto;

  @ApiPropertyOptional({ description: 'Defaults to the shipping address' })
  @IsOptional() @ValidateNested() @Type(() => OrderAddressDto) billingAddress?: OrderAddressDto;

  @ApiPropertyOptional({ description: 'Required unless the store ships nothing' })
  @IsOptional() @IsUUID() shippingMethodId?: string;

  @ApiPropertyOptional({ enum: ['COD', 'ONLINE'], default: 'COD' })
  @IsOptional() @IsIn(['COD', 'ONLINE']) paymentMethod?: 'COD' | 'ONLINE';

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) notes?: string;
}

export class OrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;

  @ApiPropertyOptional() @IsOptional() @IsUUID() customerId?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 300) reason?: string;
}
