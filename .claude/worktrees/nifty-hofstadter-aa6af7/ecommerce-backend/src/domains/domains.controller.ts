import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainsService } from './domains.service';
import { Public, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { AddDomainDto } from './dto/domain.dto';

@ApiTags('Domains')
@ApiBearerAuth()
@Controller('domains')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Domains connected to this store' })
  findAll() {
    return this.domains.findAll();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Connect a custom domain and get its DNS records' })
  add(@Body() dto: AddDomainDto) {
    return this.domains.add(dto);
  }

  @Get(':id/instructions')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  instructions(@Param('id', ParseUUIDPipe) id: string) {
    return this.domains.getInstructions(id);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Check DNS for the ownership record' })
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.domains.verify(id);
  }

  @Patch(':id/primary')
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  setPrimary(@Param('id', ParseUUIDPipe) id: string) {
    return this.domains.setPrimary(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.domains.remove(id);
  }
}

/**
 * Separate controller because this one route is unauthenticated and must not
 * require a resolved tenant: the reverse proxy calls it *before* a hostname is
 * servable, which is precisely when tenant resolution would fail.
 *
 * Caddy expects 200 to allow a certificate and any error status to refuse.
 */
@ApiTags('Domains')
@Controller('tls')
export class TlsAuthorityController {
  constructor(private readonly domains: DomainsService) {}

  @Public()
  @TenantOptional()
  @Get('check')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async check(@Query('domain') domain?: string) {
    const allowed = await this.domains.isAllowedForTls(domain ?? '');

    if (!allowed) {
      throw new NotFoundException({
        message: 'That hostname is not connected to a store.',
        code: 'DOMAIN_NOT_ALLOWED',
      });
    }

    return { allowed: true };
  }
}
