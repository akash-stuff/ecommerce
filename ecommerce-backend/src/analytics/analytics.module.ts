import { Module } from '@nestjs/common';
import { AnalyticsController, PlatformAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PlatformAnalyticsService } from './platform-analytics.service';

@Module({
  controllers: [AnalyticsController, PlatformAnalyticsController],
  providers: [AnalyticsService, PlatformAnalyticsService],
  exports: [AnalyticsService, PlatformAnalyticsService],
})
export class AnalyticsModule {}
