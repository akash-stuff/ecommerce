import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { GatewaysService } from './gateways.service';
import { CodProvider } from './providers/cod.provider';
import { RazorpayProvider } from './providers/razorpay.provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, GatewaysService, CodProvider, RazorpayProvider],
  exports: [PaymentsService, GatewaysService],
})
export class PaymentsModule {}
