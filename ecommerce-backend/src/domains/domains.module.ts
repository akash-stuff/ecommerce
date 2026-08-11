import { Module } from '@nestjs/common';
import { DomainsController, TlsAuthorityController } from './domains.controller';
import { DomainsService } from './domains.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [TenantsModule],
  controllers: [DomainsController, TlsAuthorityController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
