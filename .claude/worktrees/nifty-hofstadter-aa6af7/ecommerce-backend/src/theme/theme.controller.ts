import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThemeService } from './theme.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { ALLOWED_FONTS, HOMEPAGE_SECTIONS, UpdateStorefrontDto, UpdateThemeDto } from './dto/theme.dto';

@ApiTags('Appearance')
@ApiBearerAuth()
@Controller('theme')
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  @ApiOperation({ summary: 'The store\'s editable appearance' })
  get() {
    return this.theme.get();
  }

  /** So the editor offers exactly what the server will accept. */
  @Get('options')
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  @ApiOperation({ summary: 'Fonts and sections the editor may offer' })
  options() {
    return { fonts: ALLOWED_FONTS, sections: HOMEPAGE_SECTIONS };
  }

  @Put()
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  @ApiOperation({ summary: 'Update branding; unsafe custom CSS is refused' })
  update(@Body() dto: UpdateThemeDto) {
    return this.theme.update(dto);
  }

  @Put('storefront')
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Store name, description and SEO defaults' })
  updateStorefront(@Body() dto: UpdateStorefrontDto) {
    return this.theme.updateStorefront(dto);
  }
}
