import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BannersService } from './banners.service';
import { Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import {
  BANNER_PLACEMENTS,
  BannerQueryDto,
  CreateBannerDto,
  UpdateBannerDto,
} from './dto/banner.dto';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Banners a shopper should see now, in display order' })
  listLive(@Query() query: BannerQueryDto) {
    return this.banners.listLive(query.placement);
  }

  /** Before `:id`, so "placements" is never parsed as a UUID. */
  @ApiBearerAuth()
  @Get('placements')
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  @ApiOperation({ summary: 'Slots the storefront renders a banner in' })
  placements() {
    return { placements: BANNER_PLACEMENTS };
  }

  @ApiBearerAuth()
  @Get('admin')
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  @ApiOperation({ summary: 'Every banner, including scheduled and expired' })
  findAll(@Query() query: BannerQueryDto) {
    return this.banners.findAll(query.placement);
  }

  @ApiBearerAuth()
  @Post()
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  create(@Body() dto: CreateBannerDto) {
    return this.banners.create(dto);
  }

  @ApiBearerAuth()
  @Put(':id')
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.banners.update(id, dto);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.THEME_UPDATE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.banners.remove(id);
  }
}
