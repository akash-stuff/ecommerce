import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CheckoutDto, OrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';

/**
 * Checkout is public: a guest may buy without an account. When a customer token
 * is present the order is attached to them, which is what makes it appear under
 * `/orders/mine`.
 */
@ApiTags('Checkout')
@ApiHeader({ name: 'x-cart-token', required: false, description: 'Guest cart token' })
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly orders: OrdersService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Place an order from the current cart' })
  checkout(@Body() dto: CheckoutDto, @Headers('x-cart-token') token?: string) {
    return this.orders.checkout(token ?? null, dto);
  }
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Declared before `:id` so "mine" is not parsed as an order id. A customer
   * token carries no admin permission, so these two trees never overlap.
   */
  @Get('mine')
  @ApiOperation({ summary: 'The signed-in customer\'s own orders' })
  findMine(@Query() query: OrderQueryDto) {
    return this.orders.findMine(query);
  }

  @Get('mine/:orderNumber')
  findMineByNumber(@Param('orderNumber') orderNumber: string) {
    return this.orders.findMineByNumber(orderNumber);
  }

  @Post('mine/:orderNumber/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel your own order while it is still early' })
  cancelMine(
    @Param('orderNumber') orderNumber: string,
    @Body('reason') reason?: string,
  ) {
    return this.orders.cancelMine(orderNumber, reason);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  findAll(@Query() query: OrderQueryDto) {
    return this.orders.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ORDERS_UPDATE)
  @ApiOperation({ summary: 'Advance an order; cancelling returns its stock' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, dto.status, dto.reason);
  }
}
