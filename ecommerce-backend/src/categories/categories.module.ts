import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoryShowcaseService } from './category-showcase.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryShowcaseService],
  exports: [CategoriesService, CategoryShowcaseService],
})
export class CategoriesModule {}
