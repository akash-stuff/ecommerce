import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { ASSIGNABLE_ROLES, CreateStaffDto, StaffQueryDto, UpdateStaffDto } from './dto/staff.dto';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STAFF_READ)
  @ApiOperation({ summary: 'Everyone with access to this store' })
  findAll(@Query() query: StaffQueryDto) {
    return this.staff.findAll(query);
  }

  /** Before `:id`, so "roles" is never parsed as a UUID. */
  @Get('roles')
  @RequirePermissions(PERMISSIONS.STAFF_READ)
  @ApiOperation({ summary: 'Roles this store can assign' })
  roles() {
    return { roles: ASSIGNABLE_ROLES };
  }

  /**
   * STAFF_MANAGE, which TENANT_ADMIN deliberately does not have — see
   * ROLE_PERMISSIONS. Only the owner adds or removes people.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @ApiOperation({ summary: 'Give someone access; returns a one-time password' })
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @ApiOperation({ summary: 'Issue a new one-time password' })
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.resetPassword(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STAFF_MANAGE)
  @ApiOperation({ summary: 'Remove access to this store' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.remove(id);
  }
}
