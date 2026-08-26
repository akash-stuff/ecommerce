import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { ShipmentStatus } from '@prisma/client';

export class CreateShipmentDto {
  @ApiPropertyOptional({ description: 'Defaults to the order\'s chosen method' })
  @IsOptional() @IsUUID() methodId?: string;

  @ApiPropertyOptional({ example: 'Delhivery' })
  @IsOptional() @IsString() @MaxLength(60) provider?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) trackingNumber?: string;

  @ApiPropertyOptional({ description: 'Where the customer can follow the parcel' })
  @IsOptional() @IsUrl({ require_tld: false }) trackingUrl?: string;

  @ApiPropertyOptional({ enum: ShipmentStatus, default: 'IN_TRANSIT' })
  @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;
}

export class UpdateShipmentDto {
  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) trackingNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_tld: false }) trackingUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) provider?: string;
}
