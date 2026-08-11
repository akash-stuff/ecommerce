import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CartsService } from './carts.service';
import { Public } from '../common/decorators';
import { ApplyCouponDto } from '../coupons/dto/coupon.dto';
import {
  AddCartItemDto,
  CartShippingQuoteDto,
  CartViewQueryDto,
  UpdateCartItemDto,
} from './dto/cart.dto';

/**
 * Public because a guest must be able to shop before signing in. The cart token
 * in `x-cart-token` identifies an anonymous cart; a signed-in customer's token
 * is ignored in favour of their own cart.
 *
 * The token is not a tenant hint — it is looked up inside the tenant resolved
 * from the hostname, so a token from another store finds nothing.
 */
@ApiTags('Cart')
@ApiHeader({ name: 'x-cart-token', required: false, description: 'Guest cart token' })
@Controller('cart')
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Current cart with server-computed totals' })
  @ApiQuery({ name: 'shippingMethodId', required: false })
  @ApiQuery({ name: 'cod', required: false, description: 'Include the COD fee' })
  view(
    @Query() query: CartViewQueryDto,
    @Headers('x-cart-token') token?: string,
  ) {
    return this.carts.view(token ?? null, query.shippingMethodId ?? null, query.cod === true);
  }

  @Public()
  @Post('items')
  @ApiOperation({ summary: 'Add an item, creating a cart if there is none' })
  addItem(@Body() dto: AddCartItemDto, @Headers('x-cart-token') token?: string) {
    return this.carts.addItem(token ?? null, dto);
  }

  @Public()
  @Patch('items/:id')
  @ApiOperation({ summary: 'Set a line quantity; 0 removes the line' })
  setQuantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
    @Headers('x-cart-token') token?: string,
  ) {
    return this.carts.setQuantity(token ?? null, id, dto.quantity);
  }

  @Public()
  @Delete('items/:id')
  removeItem(@Param('id', ParseUUIDPipe) id: string, @Headers('x-cart-token') token?: string) {
    return this.carts.removeItem(token ?? null, id);
  }

  @Public()
  @Post('coupon')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply a coupon code to the cart' })
  applyCoupon(@Body() dto: ApplyCouponDto, @Headers('x-cart-token') token?: string) {
    return this.carts.applyCoupon(token ?? null, dto.code);
  }

  @Public()
  @Delete('coupon')
  removeCoupon(@Headers('x-cart-token') token?: string) {
    return this.carts.removeCoupon(token ?? null);
  }

  @Public()
  @Post('shipping-options')
  @HttpCode(200)
  @ApiOperation({ summary: 'Deliverable methods and rates for an address' })
  shippingOptions(
    @Body() dto: CartShippingQuoteDto,
    @Headers('x-cart-token') token?: string,
  ) {
    return this.carts.shippingOptions(token ?? null, dto);
  }

  @Post('merge')
  @HttpCode(200)
  @ApiOperation({ summary: 'Fold a guest cart into the signed-in customer\'s cart' })
  merge(@Headers('x-cart-token') token?: string) {
    return this.carts.merge(token ?? null);
  }
}
