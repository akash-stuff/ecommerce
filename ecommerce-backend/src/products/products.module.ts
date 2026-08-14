import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { FacetsService } from './facets.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, FacetsService],
  exports: [ProductsService, FacetsService],
})
export class ProductsModule {}
