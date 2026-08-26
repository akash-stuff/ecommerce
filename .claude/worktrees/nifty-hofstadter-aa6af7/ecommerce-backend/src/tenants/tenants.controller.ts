import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { PlatformOnly, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@ApiTags('Platform · Tenants')
@ApiBearerAuth()
@PlatformOnly()
@RequirePermissions(PERMISSIONS.PLATFORM_TENANTS_MANAGE)
@Controller('platform/tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'List every tenant on the platform' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.tenants.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Provision a tenant, store, theme, domain and owner' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a tenant and revoke its active sessions' })
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body('reason') reason: string) {
    return this.tenants.suspend(id, reason);
  }

  @Patch(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenants.activate(id);
  }
}
