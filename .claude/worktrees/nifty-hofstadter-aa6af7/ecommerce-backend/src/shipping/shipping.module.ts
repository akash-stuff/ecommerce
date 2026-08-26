import { Module } from '@nestjs/common';
import { ShippingController, ShipmentsController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { ShipmentsService } from './shipments.service';

@Module({
  controllers: [ShippingController, ShipmentsController],
  providers: [ShippingService, ShipmentsService],
  exports: [ShippingService, ShipmentsService],
})
export class ShippingModule {}
