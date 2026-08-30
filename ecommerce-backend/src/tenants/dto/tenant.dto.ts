import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import {
  IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength,
} from 'class-validator';
import { ASSIGNABLE_ROLES, AssignableRole, CreateStaffDto } from '../../staff/dto/staff.dto';

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

/**
 * Deleting a store.
 *
 * The slug is typed back rather than inferred from the path, so the request
 * carries proof that a person read which store they were about to destroy.
 */
export class DeleteTenantDto {
  @ApiProperty({ description: "The store's slug, typed to confirm" })
  @IsString() @Length(1, 60) confirmSlug!: string;
}

/**
 * Someone the platform adds to a store's admin.
 *
 * The same fields the store's own Staff screen collects, because it creates the
 * same `TenantUser` row through the same service — see `StaffService.addMember`.
 * The one difference is that `role` may be left out: the console reaches for
 * this when a shop has asked for another administrator, so that is the default
 * rather than something to be chosen every time.
 *
 * TENANT_OWNER is not offered here any more than it is there. A store has one
 * owner, provisioned with it, and the console already has a separate button for
 * resetting that account's password.
 */
export class AddStoreAdminDto extends OmitType(CreateStaffDto, ['role'] as const) {
  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES, default: SystemRole.TENANT_ADMIN })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[], {
    message: 'Choose either Administrator or Staff.',
  })
  role?: AssignableRole;
}
