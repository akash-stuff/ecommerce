import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { Public, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import {
  CreateProductDto, ProductQueryDto, UpdateProductDto,
} from './dto/product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List products for the current store' })
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Fetch a published product by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRODUCTS_DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
