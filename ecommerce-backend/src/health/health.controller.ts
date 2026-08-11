import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public, TenantOptional } from '../common/decorators';

@ApiTags('System')
@Controller('health')
@TenantOptional()
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }
}
