import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CouponQueryDto, CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

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

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COUPONS_WRITE)
  @ApiOperation({ summary: 'Deactivate a coupon (orders keep referencing it)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.deactivate(id);
  }
}
