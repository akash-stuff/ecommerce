import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { BooleanQuery } from '../../common/decorators/boolean-query';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Roles a store may hand out.
 *
 * TENANT_OWNER is absent on purpose. There is exactly one owner, created when
 * the store is provisioned, and it is the role that can connect the bank
 * account — letting an admin mint another one from this screen would make the
 * distinction meaningless. SUPER_ADMIN and CUSTOMER are not tenant staff at all.
 */
export const ASSIGNABLE_ROLES = [SystemRole.TENANT_ADMIN, SystemRole.STAFF] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateStaffDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter the email address they will sign in with.' })
  @MaxLength(160)
  email!: string;

  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES as unknown as string[], {
    message: 'Choose either Administrator or Staff.',
  })
  role!: AssignableRole;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[], {
    message: 'Choose either Administrator or Staff.',
  })
  role?: AssignableRole;

  /**
   * Suspends the membership without deleting it, so the person's history and
   * any audit rows keep pointing at a real account.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @BooleanQuery()
  isActive?: boolean;
}

export class StaffQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Omit for everyone; false for suspended' })
  @BooleanQuery()
  isActive?: boolean;
}
