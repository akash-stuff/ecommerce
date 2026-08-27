import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { PlatformOnly, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateTenantDto, DeleteTenantDto, UpdateTenantDto } from './dto/tenant.dto';

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

  /**
   * Permanent, and cascades to every row the store owns.
   *
   * The slug goes in the body as a typed confirmation rather than as a second
   * path segment: a URL is something that can be constructed by accident or
   * replayed from a log, and this is the one operation on the platform that
   * cannot be undone.
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a store and all of its data',
    description:
      'Refused unless `confirmSlug` matches, and refused outright once the ' +
      'store has taken any order — cancel those instead.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeleteTenantDto) {
    return this.tenants.remove(id, dto.confirmSlug);
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
