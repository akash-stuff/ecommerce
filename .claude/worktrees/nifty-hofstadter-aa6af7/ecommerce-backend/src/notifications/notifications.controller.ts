import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { MailerService } from './mailer.service';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Everything this store has tried to send' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.notifications.findAll(query);
  }

  /**
   * Whether email can leave the building at all. The admin needs to know this
   * before wondering why customers report missing receipts.
   */
  @Get('status')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Whether outbound email is configured' })
  status() {
    return {
      emailConfigured: this.mailer.isConfigured(),
      detail: this.mailer.isConfigured()
        ? 'Outbound email is configured.'
        : 'No SMTP host is set, so nothing is being delivered. Messages are still recorded and can be retried once SMTP is configured.',
    };
  }

  @Post('retry')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Retry queued and failed messages' })
  retry() {
    return this.notifications.retryPending();
  }
}
