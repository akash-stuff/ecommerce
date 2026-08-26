import { Global, Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantResolverService } from './tenant-resolver.service';

@Global()
@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantResolverService],
  exports: [TenantResolverService, TenantsService],
})
export class TenantsModule {}
