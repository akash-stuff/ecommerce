import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { Public, PlatformOnly, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@ApiTags('Plans')
@ApiBearerAuth()
@Controller('platform/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  @ApiOperation({ summary: 'Every plan, with how many stores are on each' })
  findAll() {
    return this.plans.findAll();
  }

  @Post()
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Put(':id')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_PLANS_MANAGE)
  @ApiOperation({ summary: 'Retire a plan; refused while stores are on it' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.deactivate(id);
  }
}
