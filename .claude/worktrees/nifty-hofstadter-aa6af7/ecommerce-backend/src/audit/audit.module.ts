import { Global, Module } from '@nestjs/common';
import { AuditController, PlatformAuditController } from './audit.controller';
import { AuditService } from './audit.service';

/** Global: anything worth auditing should not need to import a module first. */
@Global()
@Module({
  controllers: [AuditController, PlatformAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
