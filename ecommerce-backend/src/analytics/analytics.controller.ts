import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { AnalyticsService } from './analytics.service';
import { RequirePermissions } from '../common/decorators';
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
