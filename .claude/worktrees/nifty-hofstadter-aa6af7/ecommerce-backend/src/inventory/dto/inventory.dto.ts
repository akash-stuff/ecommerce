import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { InventoryReason } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AdjustStockDto {
  @IsUUID() productId!: string;

  /** Adjust a specific variant's stock instead of the product's own. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() variantId?: string;

  /**
   * Signed: negative removes stock, positive adds it. Zero is rejected — an
   * adjustment that changes nothing is a mistake, and it would still write a
   * ledger row implying something happened.
   */
  @Type(() => Number) @IsInt() @NotEquals(0) quantityDelta!: number;

  @IsEnum(InventoryReason) reason!: InventoryReason;

  /** Order number, supplier invoice, whatever ties this to the real world. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) reference?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class InventoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() variantId?: string;
  @ApiPropertyOptional({ enum: InventoryReason })
  @IsOptional() @IsEnum(InventoryReason) reason?: InventoryReason;
}
