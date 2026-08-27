import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { AnalyticsService } from './analytics.service';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { PlatformOnly, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';

class DashboardQueryDto {
  /** Fixed windows rather than free dates: the comparison period is derived. */
  @IsOptional() @Type(() => Number) @IsIn([7, 30, 90]) days?: number;
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @ApiQuery({ name: 'days', required: false, enum: [7, 30, 90] })
  @ApiOperation({ summary: 'Revenue, orders and what needs attention' })
  dashboard(@Query() query: DashboardQueryDto) {
    return this.analytics.dashboard(query.days ?? 30);
  }
}

/** Reads across every tenant, so it is a separate, platform-only controller. */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('platform/analytics')
export class PlatformAnalyticsController {
  constructor(private readonly analytics: PlatformAnalyticsService) {}

  @Get('overview')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_ANALYTICS_READ)
  @ApiQuery({ name: 'days', required: false, enum: [7, 30, 90] })
  @ApiOperation({ summary: 'Stores, gross sales and the busiest tenants' })
  overview(@Query() query: DashboardQueryDto) {
    return this.analytics.overview(query.days ?? 30);
  }

  /**
   * One store, reported the way the operator reads the platform.
   *
   * The tenant is a path parameter rather than a header or a query filter,
   * because it is the subject of the request rather than a narrowing of it —
   * and a 404 for an unknown id is then the natural answer.
   */
  @Get('stores/:tenantId')
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_ANALYTICS_READ)
  @ApiQuery({ name: 'days', required: false, enum: [7, 30, 90] })
  @ApiOperation({ summary: 'Revenue, orders and catalogue for a single store' })
  async store(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: DashboardQueryDto,
  ) {
    const report = await this.analytics.storeBreakdown(tenantId, query.days ?? 30);
    if (!report) {
      throw new NotFoundException({
        message: 'That store does not exist.',
        code: 'TENANT_NOT_FOUND',
      });
    }
    return report;
  }
}
