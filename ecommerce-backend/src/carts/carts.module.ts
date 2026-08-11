import { Module } from '@nestjs/common';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';
import { CouponsModule } from '../coupons/coupons.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [CouponsModule, ShippingModule],
  controllers: [CartsController],
  providers: [CartsService],
  exports: [CartsService],
})
export class CartsModule {}
