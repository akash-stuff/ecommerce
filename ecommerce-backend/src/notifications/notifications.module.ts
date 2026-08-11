import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { MailerService } from './mailer.service';

/**
 * Global: orders, auth and anything else that needs to tell a customer
 * something should not each have to import this module.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, MailerService],
  exports: [NotificationsService, MailerService],
})
export class NotificationsModule {}
