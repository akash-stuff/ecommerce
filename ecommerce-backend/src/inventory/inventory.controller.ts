import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { AdjustStockDto, InventoryQueryDto } from './dto/inventory.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('transactions')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Stock ledger for the current store' })
  history(@Query() query: InventoryQueryDto) {
    return this.inventory.history(query);
  }

  @Post('adjust')
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @ApiOperation({ summary: 'Adjust stock and record why' })
  adjust(@Body() dto: AdjustStockDto) {
    return this.inventory.adjust(dto);
  }
}
