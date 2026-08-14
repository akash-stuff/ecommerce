import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @IsString() @Length(2, 60) name!: string;
  @ApiPropertyOptional({ description: 'Derived from the name when omitted' })
  @IsOptional() @IsString() @Length(2, 60) slug?: string;

  @Type(() => Number) @IsNumber() @Min(0) priceMonthly!: number;
  @Type(() => Number) @IsNumber() @Min(0) priceYearly!: number;

  /** Null means unlimited, which is different from zero. */
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxProducts?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxStaff?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxOrdersMonth?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() customDomain?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceMonthly?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceYearly?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxProducts?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxStaff?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxOrdersMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() customDomain?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
