import { IsIn, IsString, Length } from 'class-validator';

export class InitiatePaymentDto {
  @IsString() @Length(6, 40) orderNumber!: string;

  /** Checked again against the configured providers before anything happens. */
  @IsIn(['COD', 'RAZORPAY']) provider!: string;
}
