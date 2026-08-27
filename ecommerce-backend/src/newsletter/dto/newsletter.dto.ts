import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { BooleanQuery } from '../../common/decorators/boolean-query';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * The storefront form sends exactly one field.
 *
 * `source` is deliberately *not* accepted from the client. It records which of
 * our own forms a row came from, and a value a shopper can set is not a record
 * of anything.
 */
export class SubscribeDto {
  /**
   * Lowercased and trimmed before validation, so `  Sam@Example.com ` and
   * `sam@example.com` are the same subscriber rather than two rows that the
   * unique index cannot tell apart.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Enter an email address we can reach you at.' })
  @MaxLength(160)
  email!: string;
}

/**
 * `search` is inherited, not redeclared. Redeclaring it would compile to a
 * class field that shadows the base value with `undefined` — the same
 * `useDefineForClassFields` behaviour that made absent boolean filters read as
 * `false`; see BooleanQuery.
 */
export class SubscriberQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Omit for everyone; false for addresses that have opted out',
  })
  @BooleanQuery()
  subscribed?: boolean;
}
