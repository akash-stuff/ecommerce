import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@demo-store.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiProperty()
  @IsString() @IsNotEmpty({ message: 'Enter your password.' })
  password!: string;
}

export class RegisterDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Use at least 10 characters.' })
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Include an uppercase letter, a lowercase letter, and a number.',
  })
  password!: string;

  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(60)
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(20)
  phone?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  refreshToken!: string;
}

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() expiresIn!: number;
}

/**
 * Finishing a registration.
 *
 * The code is a string, not a number: it is six digits *including* leading
 * zeros, and a numeric type would turn `012345` into `12345`.
 */
export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'shopper@example.com' })
  @IsEmail() email!: string;

  @ApiProperty({ example: '123456', description: 'Spaces and dashes are ignored' })
  @IsString() @Length(4, 16) code!: string;
}

export class ResendEmailOtpDto {
  @ApiProperty({ example: 'shopper@example.com' })
  @IsEmail() email!: string;
}

/**
 * Finishing a password reset.
 *
 * The password rules mirror `RegisterDto` deliberately: a reset that accepts a
 * weaker password than registration would be the way around the policy.
 */
export class ResetPasswordDto {
  @ApiProperty({ example: 'shopper@example.com' })
  @IsEmail() email!: string;

  @ApiProperty({ example: '123456', description: 'Spaces and dashes are ignored' })
  @IsString() @Length(4, 16) code!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters.' })
  @MaxLength(128)
  password!: string;
}
