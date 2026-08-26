import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
  IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @ApiProperty() @IsString() @MaxLength(120) businessName!: string;
  @ApiProperty() @IsString() @MaxLength(120) storeName!: string;

  @ApiProperty({ description: 'Becomes {slug}.platform.com' })
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, {
    message: 'Use lowercase letters, numbers and hyphens only.',
  })
  slug!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() businessCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() templateId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string;

  @ApiProperty() @IsEmail() ownerEmail!: string;
  @ApiProperty() @IsString() @MinLength(10) ownerPassword!: string;
  @ApiProperty() @IsString() ownerFirstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerLastName?: string;
}

export class UpdateTenantDto extends PartialType(
  OmitType(CreateTenantDto, ['slug', 'ownerEmail', 'ownerPassword', 'ownerFirstName'] as const),
) {}
