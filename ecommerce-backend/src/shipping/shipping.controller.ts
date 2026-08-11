import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShippingService } from './shipping.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import {
  CreateMethodDto,
  CreateZoneDto,
  UpdateMethodDto,
  UpdateZoneDto,
} from './dto/shipping.dto';

/**
 * Admin configuration only. Shoppers get rates from `GET /cart/shipping-options`,
 * which quotes against the cart they actually have.
 */
@ApiTags('Shipping')
@ApiBearerAuth()
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('zones')
  @RequirePermissions(PERMISSIONS.SHIPPING_READ)
  @ApiOperation({ summary: 'Zones with their methods' })
  listZones() {
    return this.shipping.listZones();
  }

  @Post('zones')
  @RequirePermissions(PERMISSIONS.SHIPPING_WRITE)
  createZone(@Body() dto: CreateZoneDto) {
    return this.shipping.createZone(dto);
  }

  @Put('zones/:id')
  @RequirePermissions(PERMISSIONS.SHIPPING_WRITE)
  updateZone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto) {
    return this.shipping.updateZone(id, dto);
  }

  @Delete('zones/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SHIPPING_WRITE)
  removeZone(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipping.removeZone(id);
  }

  @Post('methods')
  @RequirePermissions(PERMISSIONS.SHIPPING_WRITE)
  createMethod(@Body() dto: CreateMethodDto) {
    return this.shipping.createMethod(dto);
  }

  @Put('methods/:id')
  @RequirePermissions(PERMISSIONS.SHIPPING_WRITE)
  updateMethod(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMethodDto) {
    return this.shipping.updateMethod(id, dto);
  }

  @Delete('methods/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SHIPPING_WRITE)
  @ApiOperation({ summary: 'Deactivate a method (shipments still reference it)' })
  removeMethod(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipping.removeMethod(id);
  }
}
