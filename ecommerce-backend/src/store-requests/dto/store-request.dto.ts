import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { StoreRequestStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Registering: asking for a store that does not exist yet.
 *
 * Public and unauthenticated, so every field is bounded and the two that decide
 * anything — the address and the password — are held to the same rules the
 * console's own create form uses. A registration that the platform cannot
 * approve without editing it is a registration that wasted everybody's time.
 */
export class CreateStoreRequestDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120, { message: 'Tell us the name of the business.' })
  businessName!: string;

  /**
   * The same shape `CreateTenantDto.slug` demands, normalised first.
   *
   * It becomes the hostname if this is approved, and it is the one field that
   * can never be changed afterwards — so it is validated here rather than
   * quietly fixed up later by whoever reviews it.
   *
   * The one difference from the console's own form: this lowercases and trims
   * before checking, where that one refuses "Northwind" outright. A public form
   * is not the place to turn somebody away over a capital letter, and what
   * reaches provisioning is identical either way.
   */
  @ApiProperty({ description: 'Becomes {slug}.platform.com if approved' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, {
    message: 'Use lowercase letters, numbers and hyphens only.',
  })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  businessCategory?: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ description: 'They will sign in with this' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter an email address we can reply to.' })
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20, { message: 'A phone number is at most 20 characters.' })
  phone?: string;

  /**
   * Ten characters, the same floor `CreateTenantDto` puts on an owner password.
   *
   * Chosen now and hashed immediately, so approval does not have to mint a
   * credential and read it out to somebody. Nothing in this codebase emails a
   * password and this is not the place to start.
   */
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Use at least 10 characters.' })
  @MaxLength(200)
  password!: string;

  @ApiPropertyOptional({ description: 'Anything else we should know' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  message?: string;

  /** Must be empty. Anything here and the request is accepted and discarded. */
  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  honeypot?: string;
}

/**
 * Turning one down.
 *
 * The note is required and goes to the applicant verbatim, because "your
 * application was unsuccessful" with no reason is the message that generates a
 * reply asking why.
 */
export class RejectStoreRequestDto {
  @ApiProperty({ description: 'Sent to the applicant as written' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(5, 1000, { message: 'Say why, in a sentence they can act on.' })
  reason!: string;
}

/**
 * Approving one, with the parts the applicant does not choose.
 *
 * Plan and template are the reviewer's call — a plan is what the store is
 * billed on and a template is a look, and neither belongs on a public form.
 */
export class ApproveStoreRequestDto {
  @ApiPropertyOptional({ description: 'Defaults to no plan' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Defaults to the general store' })
  @IsOptional()
  @IsString()
  templateId?: string;
}

export class StoreRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: StoreRequestStatus })
  @IsOptional()
  @IsEnum(StoreRequestStatus)
  status?: StoreRequestStatus;
}
