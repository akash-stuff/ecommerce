import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * An enquiry from the platform's own front page.
 *
 * Every field is bounded, because this is the one endpoint on the platform that
 * an anonymous stranger can put text into and cause an email to be sent. The
 * limits are what stops the form being used to deliver a document to somebody's
 * inbox one request at a time; the throttle on the route is the other half.
 *
 * `honeypot` is not a real field. It is rendered off-screen and left empty by
 * anyone using a browser, so anything in it came from a script filling in every
 * input it found — see `ContactService.submit`.
 */
export class ContactEnquiryDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80, { message: 'Tell us your name — between 2 and 80 characters.' })
  name!: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter an email address we can reply to.' })
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional({ description: 'A number to call back on' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20, { message: 'A phone number is at most 20 characters.' })
  phone?: string;

  @ApiPropertyOptional({ description: 'The business they are asking on behalf of' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  company?: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(10, 2000, { message: 'Say a little more — between 10 and 2000 characters.' })
  message!: string;

  /** Must be empty. Anything here and the request is accepted and discarded. */
  @ApiPropertyOptional({ description: 'Leave empty' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  honeypot?: string;
}
