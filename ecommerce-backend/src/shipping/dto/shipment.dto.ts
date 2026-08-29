import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ShipmentStatus } from '@prisma/client';
import { IsUrlOrEmpty } from '../../common/decorators/is-url-or-empty';
import { COURIER_CODES } from '../couriers';

export class CreateShipmentDto {
  @ApiPropertyOptional({ description: 'Defaults to the order\'s chosen method' })
  @IsOptional() @IsUUID() methodId?: string;

  /**
   * A code from the courier catalogue, not free text.
   *
   * Free text meant "Delhivery", "delhivery" and "Delhivary" were three
   * carriers as far as the database was concerned, and none of them could
   * produce a tracking link.
   */
  @ApiPropertyOptional({ enum: COURIER_CODES, example: 'DELHIVERY' })
  @IsOptional() @IsIn(COURIER_CODES) provider?: string;

  @ApiPropertyOptional({ description: 'The consignment or AWB number' })
  @IsOptional() @IsString() @MaxLength(120) trackingNumber?: string;

  /**
   * Overrides the URL derived from the courier and the consignment number.
   * Empty means "derive it" — see `trackingUrlFor`.
   */
  @ApiPropertyOptional({ description: 'Where the customer can follow the parcel' })
  @IsUrlOrEmpty() trackingUrl?: string;

  @ApiPropertyOptional({ enum: ShipmentStatus, default: 'IN_TRANSIT' })
  @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;
}

export class UpdateShipmentDto {
  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) trackingNumber?: string;

  /** Empty re-derives it from the courier and the consignment number. */
  @ApiPropertyOptional() @IsUrlOrEmpty() trackingUrl?: string;

  @ApiPropertyOptional({ enum: COURIER_CODES })
  @IsOptional() @IsIn(COURIER_CODES) provider?: string;
}
