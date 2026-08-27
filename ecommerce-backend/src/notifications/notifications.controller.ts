import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { MailerService } from './mailer.service';
import { PlatformOnly, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PlatformNotificationQueryDto } from './dto/notification.dto';

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

/**
 * Every store's messages, for the platform operator.
 *
 * Its own controller rather than a flag on the tenant one. The tenant route is
 * scoped by `requireTenantId()` and must stay that way; putting a "show
 * everything" mode behind the same path would make the isolation a matter of
 * which parameters happened to be sent.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('platform/notifications')
export class PlatformNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @PlatformOnly()
  @TenantOptional()
  @RequirePermissions(PERMISSIONS.PLATFORM_ANALYTICS_READ)
  @ApiOperation({ summary: "Messages across every store, with the store named" })
  findAll(@Query() query: PlatformNotificationQueryDto) {
    return this.notifications.findAllAcrossPlatform(query);
  }
}
