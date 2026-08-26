import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { PlatformOnly, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { AuditQueryDto } from './dto/audit.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: "This store's own audit trail" })
  findForTenant(@Query() query: AuditQueryDto) {
    return this.audit.findForTenant(query);
  }
}

/** Separate controller: the platform trail spans tenants, so it is not scoped. */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('platform/audit')
export class PlatformAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_AUDIT_READ)
  @ApiOperation({ summary: 'Every recorded action, across all tenants' })
  findAll(@Query() query: AuditQueryDto) {
    return this.audit.findAll(query);
  }
}
