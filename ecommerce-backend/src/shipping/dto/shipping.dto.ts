import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateZoneDto {
  @IsString() @Length(2, 80) name!: string;

  @ApiPropertyOptional({ type: [String], description: 'ISO country codes' })
  @IsOptional() @IsArray() @IsString({ each: true }) countries?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) states?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Leading digits of a postal code' })
  @IsOptional() @IsArray() @IsString({ each: true }) postalCodePrefixes?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateZoneDto extends CreateZoneDto {
  @IsOptional() @IsString() @Length(2, 80) declare name: string;
}

export class CreateMethodDto {
  @IsUUID() zoneId!: string;
  @IsString() @Length(2, 80) name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;

  @Type(() => Number) @IsNumber() @Min(0) baseRate!: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) perKgRate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) freeAboveAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() codAvailable?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) codFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minDeliveryDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxDeliveryDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateMethodDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) baseRate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) perKgRate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) freeAboveAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() codAvailable?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) codFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minDeliveryDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxDeliveryDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Enough of an address to pick a zone. Not stored. */
export class ShippingQuoteDto {
  @IsString() @Length(2, 2) country!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
}
