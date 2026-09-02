import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StoreRequestsService } from './store-requests.service';
import { PlatformOnly, Public, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import {
  ApproveStoreRequestDto,
  CreateStoreRequestDto,
  RejectStoreRequestDto,
  StoreRequestQueryDto,
} from './dto/store-request.dto';

/**
 * Registering for a store.
 *
 * `@TenantOptional` rather than `@PlatformOnly`: the form is served on the
 * platform's own hostnames, where no tenant resolves — but @PlatformOnly also
 * demands SUPER_ADMIN, and a registration only a super admin can submit is not
 * a registration.
 */
@ApiTags('Store applications')
@Controller('store-requests')
@TenantOptional()
export class StoreRequestsController {
  constructor(private readonly requests: StoreRequestsService) {}

  /**
   * Throttled to two a minute, like the contact form.
   *
   * Anonymous, it writes a row and sends two emails, and the address it asks
   * for is a scarce resource — a script filing applications takes every good
   * slug on the platform. The honeypot is the other half; see the DTO.
   */
  @Public()
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Apply for a store; a person reviews it' })
  register(@Body() dto: CreateStoreRequestDto) {
    return this.requests.register(dto);
  }
}

/**
 * The queue, and the two decisions that empty it.
 *
 * `PLATFORM_TENANTS_MANAGE` rather than a permission of its own: approving one
 * of these *is* creating a tenant, and anyone who may do that from the create
 * form may do it from here. A second grant that means the same thing is a
 * second grant to forget to give somebody.
 */
@ApiTags('Platform · Store applications')
@ApiBearerAuth()
@PlatformOnly()
@RequirePermissions(PERMISSIONS.PLATFORM_TENANTS_MANAGE)
@Controller('platform/store-requests')
export class PlatformStoreRequestsController {
  constructor(private readonly requests: StoreRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Applications, oldest pending first' })
  findAll(@Query() query: StoreRequestQueryDto) {
    return this.requests.findAll(query);
  }

  /**
   * `POST`, not `PATCH`: this does not edit a field, it provisions a store —
   * and it must never be something a browser retries on its own.
   */
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Provision the store and let the applicant in' })
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveStoreRequestDto) {
    return this.requests.approve(id, dto);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refuse it; the reason is emailed to the applicant' })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectStoreRequestDto) {
    return this.requests.reject(id, dto);
  }

  @Post(':id/discard')
  @HttpCode(200)
  @ApiOperation({ summary: 'Take it off the queue without deciding; nothing is emailed' })
  discard(@Param('id', ParseUUIDPipe) id: string) {
    return this.requests.discard(id);
  }
}
