import { Module } from '@nestjs/common';
import {
  PlatformStoreRequestsController,
  StoreRequestsController,
} from './store-requests.controller';
import { StoreRequestsService } from './store-requests.service';

/**
 * TenantsModule is @Global, so `TenantsService` — which does the provisioning
 * an approval triggers — needs no import here. MailerService comes from the
 * @Global NotificationsModule for the same reason.
 */
@Module({
  controllers: [StoreRequestsController, PlatformStoreRequestsController],
  providers: [StoreRequestsService],
})
export class StoreRequestsModule {}
