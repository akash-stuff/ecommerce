import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Connecting or editing one gateway.
 *
 * Every field is optional so the form can send only what changed. That matters
 * most for `secrets`: an omitted key keeps the stored value, and an empty string
 * clears it. A DTO that required all of them would force the browser to hold
 * secrets it is never sent, which is the thing this design avoids.
 */
export class UpsertGatewayDto {
  @ApiPropertyOptional({ description: 'Whether checkout may offer this method' })
  @IsOptional() @IsBoolean() isEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Publishable key id. Not applicable to COD.' })
  @IsOptional() @IsString() @MaxLength(200) publicKey?: string;

  @ApiPropertyOptional({ description: 'A note for your own reference' })
  @IsOptional() @IsString() @MaxLength(80) label?: string;

  /**
   * Values are validated for shape here and for meaning by the provider, which
   * rejects any field name it does not recognise. Left as a free-form object
   * because the field list belongs to the provider, not to this DTO — a fixed
   * set here would have to be edited every time a gateway is added.
   */
  @ApiPropertyOptional({
    description: 'Secret credentials by field name. Omit to keep, "" to clear.',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional() @IsObject() secrets?: Record<string, string>;
}
