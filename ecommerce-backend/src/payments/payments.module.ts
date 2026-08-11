import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CodProvider } from './providers/cod.provider';
import { RazorpayProvider } from './providers/razorpay.provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, CodProvider, RazorpayProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
