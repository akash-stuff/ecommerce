import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * A GSTIN is 15 characters with a fixed shape: two state-code digits, a
 * ten-character PAN, an entity digit, the letter Z, and a checksum character.
 *
 * It is checked rather than taken as free text because this number is printed
 * on a tax document and quoted by the buyer when they claim input credit — a
 * typo here is discovered by an accountant months later, not by the shopkeeper.
 * The check is structural only: it cannot tell whether the number is
 * registered, and does not pretend to.
 */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Five letters, four digits, one letter. */
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Every field is optional and clearable. A store that fills in none of them
 * still gets a usable invoice — the service falls back to the trading name,
 * address and email already on the store record.
 */
export class UpdateInvoiceSettingsDto {
  @ApiPropertyOptional({ description: 'Registered legal name, if it differs from the store name' })
  @IsOptional() @IsString() @MaxLength(200) businessName?: string;

  @ApiPropertyOptional({ description: '15-character GSTIN. Empty if not registered.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @Matches(GSTIN, {
    message: 'That is not a valid GSTIN. It is 15 characters, like 27AAPFU0939F1ZV.',
  })
  gstin?: string;

  @ApiPropertyOptional({ description: '10-character PAN. Empty to omit.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @Matches(PAN, { message: 'That is not a valid PAN. It is 10 characters, like AAPFU0939F.' })
  pan?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) addressLine1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) addressLine2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;

  @ApiPropertyOptional({
    description:
      'Decides whether an order is taxed as CGST + SGST or as IGST, by comparison with the delivery address.',
  })
  @IsOptional() @IsString() @MaxLength(80) state?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(12) postalCode?: string;

  /**
   * Checked as an address rather than taken as free text.
   *
   * This one is printed on a tax document and is where a buyer's accounts
   * department writes when they query it. It used to be a bare `@IsString()`,
   * which accepted "accouns@" and put it on every invoice the shop issued until
   * somebody noticed the replies were not arriving.
   *
   * `ValidateIf` skips the check for the empty string, which is how the form
   * removes an override and restores the store's own address — the same shape
   * the GSTIN and PAN fields above use.
   */
  @ApiPropertyOptional({ description: 'Billing address for invoices. Empty to use the store email.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @IsEmail({}, { message: 'Enter a valid email address, or leave it empty to use your store email.' })
  @MaxLength(200)
  email?: string;

  /**
   * Five to twenty characters, matching what checkout accepts from a shopper
   * and what the customer record allows. Forty was this field's own number and
   * nothing else's; a number that long is a typo rather than a phone number.
   */
  @ApiPropertyOptional({ description: 'Billing number for invoices. Empty to use the store phone.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== '')
  @IsString()
  @Length(5, 20, { message: 'A phone number is between 5 and 20 characters.' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Prefixed to the order number, e.g. INV-' })
  @IsOptional() @IsString() @MaxLength(12) prefix?: string;

  @ApiPropertyOptional({ description: 'Terms, bank details or a thank-you, printed at the foot' })
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
