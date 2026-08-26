import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThemeService } from './theme.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import {
  ALLOWED_FONTS,
  ApplyTemplateDto,
  HOMEPAGE_SECTIONS,
  UpdateStorefrontDto,
  UpdateThemeDto,
} from './dto/theme.dto';
import { BACKGROUND_FITS, BACKGROUND_PRESETS, LOGO_SIZES } from './backgrounds';

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
    return {
      fonts: ALLOWED_FONTS,
      sections: HOMEPAGE_SECTIONS,
      backgrounds: BACKGROUND_PRESETS,
      backgroundFits: BACKGROUND_FITS,
      logoSizes: LOGO_SIZES,
    };
  }

  /**
   * The template catalogue, from a shopkeeper's point of view.
   *
   * `/platform/templates/gallery` serves the same rows but is @PlatformOnly, so
   * it is unreachable for the person who actually runs the store. Same data,
   * different door — and this one asks only for `theme.update`.
   */
  @Get('templates')
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  @ApiOperation({ summary: 'Templates this store can be switched to' })
  templates() {
    return this.theme.listTemplates();
  }

  @Post('template')
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  @ApiOperation({
    summary: "Adopt a template's colours, type and homepage sections",
    description:
      "Values are copied into this store's theme. The logo, favicon and custom " +
      'CSS are kept unless explicitly cleared.',
  })
  applyTemplate(@Body() dto: ApplyTemplateDto) {
    return this.theme.applyTemplate(dto);
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
