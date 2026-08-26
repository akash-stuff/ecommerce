import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { PlatformOnly, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { ALLOWED_FONTS, HOMEPAGE_SECTIONS } from '../theme/dto/theme.dto';

@ApiTags('Templates')
@ApiBearerAuth()
@Controller('platform/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Every template, with how many stores were built from each' })
  findAll() {
    return this.templates.findAll();
  }

  /**
   * The picker on the store-creation form. Separate from the list above so a
   * retired template cannot be offered for a new store by accident — filtering
   * that in the browser would put the rule in the wrong place.
   */
  @Get('gallery')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANTS_MANAGE)
  @ApiOperation({ summary: 'Active templates only, for choosing when creating a store' })
  gallery() {
    return this.templates.listActive();
  }

  /**
   * The same allowlists the editor enforces, served rather than duplicated in
   * the console. `/theme/options` cannot be reused here: it is tenant-scoped,
   * and the platform console runs without a tenant.
   */
  @Get('options')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Fonts and homepage sections a template may specify' })
  options() {
    return { fonts: ALLOWED_FONTS, sections: HOMEPAGE_SECTIONS };
  }

  @Post()
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_TEMPLATES_MANAGE)
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Put(':id')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Edit a template; existing storefronts are not touched' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Delete a template; refused once a store has used it' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.remove(id);
  }
}
