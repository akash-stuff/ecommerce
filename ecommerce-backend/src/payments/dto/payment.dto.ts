import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsString, Length } from 'class-validator';

export class InitiatePaymentDto {
  @IsString() @Length(6, 40) orderNumber!: string;

  /** Checked again against the configured providers before anything happens. */
  @IsIn(['COD', 'RAZORPAY']) provider!: string;
}

/**
 * What the gateway's browser widget hands back.
 *
 * Left as a loose string map on purpose: the field names belong to the provider
 * (`razorpay_payment_id` and friends), and naming them here would mean editing
 * this DTO for every gateway added. The provider validates what it needs.
 */
export class ConfirmPaymentDto {
  @ApiProperty({ example: 'ORD-20260826-ABC123' })
  @IsString() @Length(3, 40) orderNumber!: string;

  @ApiProperty({ example: 'RAZORPAY' })
  @IsString() @Length(2, 30) provider!: string;

  @ApiProperty({
    description: "The gateway's success payload, verbatim",
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsObject() payload!: Record<string, string>;
}
