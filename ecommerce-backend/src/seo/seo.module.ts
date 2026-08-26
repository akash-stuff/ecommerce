import { Module } from '@nestjs/common';
import { SeoController, StorefrontHtmlController } from './seo.controller';
import { SeoService } from './seo.service';
import { SsrService } from './ssr.service';

@Module({
  controllers: [SeoController, StorefrontHtmlController],
  providers: [SeoService, SsrService],
})
export class SeoModule {}
