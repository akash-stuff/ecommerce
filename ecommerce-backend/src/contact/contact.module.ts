import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

/** MailerService comes from NotificationsModule, which is @Global. */
@Module({
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
