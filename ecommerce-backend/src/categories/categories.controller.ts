import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CategoryShowcaseService } from './category-showcase.service';
import { Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly showcase: CategoryShowcaseService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List categories for the current store' })
  findAll(@Query() query: CategoryQueryDto) {
    return this.categories.findAll(query);
  }

  /**
   * Before `slug/:slug` and `:id`, so "showcase" is never read as either.
   */
  @Public()
  @Get('showcase')
  @ApiOperation({ summary: 'Top-level categories with counts and real discount ranges' })
  showcaseTiles() {
    return this.showcase.tiles();
  }

  @Public()
  @Get('tree')
  @ApiOperation({ summary: 'Active categories as a nested tree, for storefront nav' })
  findTree() {
    return this.categories.findTree();
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Fetch an active category by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.categories.findBySlug(slug);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  @ApiOperation({ summary: 'Create a category' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}
