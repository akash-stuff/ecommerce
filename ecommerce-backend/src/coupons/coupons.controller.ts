import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import {
  CouponQueryDto,
  CreateCouponDto,
  SetCouponActiveDto,
  UpdateCouponDto,
} from './dto/coupon.dto';

/**
 * Admin-only. Shoppers never browse coupons — they apply one to a cart, which
 * is `POST /cart/coupon`, so that an unlisted code cannot be enumerated here.
 */
@ApiTags('Coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COUPONS_READ)
  findAll(@Query() query: CouponQueryDto) {
    return this.coupons.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COUPONS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COUPONS_WRITE)
  create(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.COUPONS_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  /**
   * On or off. The reversible control, and the one most days want.
   *
   * A body rather than two routes, so switching a coupon back on is the same
   * call with a different value — an `/activate` and a `/deactivate` pair is
   * two things to keep in step for no gain.
   */
  @Patch(':id/active')
  @RequirePermissions(PERMISSIONS.COUPONS_WRITE)
  @ApiOperation({ summary: 'Switch a coupon on or off; orders keep their record' })
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCouponActiveDto,
  ) {
    return this.coupons.setActive(id, dto.isActive);
  }

  /**
   * Gone for good, and only for a coupon nobody has redeemed.
   *
   * `DELETE` used to deactivate, which meant the console had no way to remove a
   * coupon created by mistake and a list that filled up with typos. It now does
   * what the verb says, and refuses with `COUPON_IN_USE` when carrying it out
   * would damage the record of an order.
   */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.COUPONS_WRITE)
  @ApiOperation({ summary: 'Delete a coupon that has never been redeemed' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.remove(id);
  }
}
