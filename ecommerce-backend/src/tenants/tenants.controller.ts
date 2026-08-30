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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { PlatformOnly, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import {
  AddStoreAdminDto,
  CreateTenantDto,
  DeleteTenantDto,
  UpdateTenantDto,
} from './dto/tenant.dto';

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

  /**
   * A new password for the store's owner, returned once.
   *
   * `POST` rather than `PATCH`: it is not an edit to a field, it mints a
   * credential, and it must never be something a browser retries on its own.
   *
   * The password is in the response and nowhere else — not emailed, not stored.
   * A store owner's password has no expiry, so mailing it would leave a working
   * credential sitting in an inbox and in the notifications table, which is the
   * same reason the staff invite carries none.
   */
  @Post(':id/owner-password')
  @HttpCode(200)
  @ApiOperation({ summary: "Reset the store owner's password; shown once" })
  resetOwnerPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenants.resetOwnerPassword(id);
  }

  /**
   * Another administrator for a store, added from the console.
   *
   * The store's own Staff screen is the ordinary way to do this, and it stays
   * that way — this exists for the case that screen cannot help with, which is
   * a shop whose only admin account has been lost. Same row, same invite email,
   * same one-time password returned exactly once.
   */
  @Post(':id/admins')
  @ApiOperation({ summary: 'Give someone admin access to a store; returns a one-time password' })
  addAdmin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddStoreAdminDto) {
    return this.tenants.addAdmin(id, dto);
  }
}
