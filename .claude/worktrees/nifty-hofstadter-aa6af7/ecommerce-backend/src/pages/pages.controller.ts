import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PagesService } from './pages.service';
import { Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CreatePageDto, PageQueryDto, UpdatePageDto } from './dto/page.dto';

@ApiTags('Pages')
@Controller('pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Published pages, for storefront navigation' })
  listPublished() {
    return this.pages.listPublished();
  }

  /**
   * Placed before `:id` so a slug is never parsed as a UUID. The admin list
   * lives at `/pages/admin` for the same reason.
   */
  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'One published page, sanitised' })
  findBySlug(@Param('slug') slug: string) {
    return this.pages.findBySlug(slug);
  }

  @ApiBearerAuth()
  @Get('admin')
  @RequirePermissions(PERMISSIONS.PAGES_WRITE)
  @ApiOperation({ summary: 'Every page, including drafts' })
  findAll(@Query() query: PageQueryDto) {
    return this.pages.findAll(query);
  }

  @ApiBearerAuth()
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PAGES_WRITE)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.findOne(id);
  }

  @ApiBearerAuth()
  @Post()
  @RequirePermissions(PERMISSIONS.PAGES_WRITE)
  @ApiOperation({ summary: 'Create a page; returns what was stripped' })
  create(@Body() dto: CreatePageDto) {
    return this.pages.create(dto);
  }

  @ApiBearerAuth()
  @Put(':id')
  @RequirePermissions(PERMISSIONS.PAGES_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePageDto) {
    return this.pages.update(id, dto);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PAGES_WRITE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.remove(id);
  }
}
