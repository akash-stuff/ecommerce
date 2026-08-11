import { Module } from '@nestjs/common';
import { CheckoutController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CartsModule } from '../carts/carts.module';
import { CouponsModule } from '../coupons/coupons.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [CartsModule, CouponsModule, InventoryModule, ShippingModule],
  controllers: [CheckoutController, OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
