import { Global, Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantResolverService } from './tenant-resolver.service';
import { StaffModule } from '../staff/staff.module';

@Global()
@Module({
  // For StaffService: adding an administrator from the console creates the
  // same TenantUser row, through the same service, as the store's own screen.
  imports: [StaffModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantResolverService],
  exports: [TenantResolverService, TenantsService],
})
export class TenantsModule {}
