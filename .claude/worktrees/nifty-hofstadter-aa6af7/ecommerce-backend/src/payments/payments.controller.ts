import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { Public, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { InitiatePaymentDto } from './dto/payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'Payment methods this store can actually accept' })
  providers() {
    return { providers: this.payments.availableProviders() };
  }

  @Public()
  @Post('initiate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start a payment attempt for an existing order' })
  initiate(@Body() dto: InitiatePaymentDto) {
    return this.payments.initiate(dto.orderNumber, dto.provider);
  }

  /**
   * Provider callback.
   *
   * `@TenantOptional` because it arrives on the bare API hostname with no tenant
   * — the tenant is discovered from the payment row the signed payload points
   * at. `@Public` because the signature is the authentication.
   */
  @Public()
  @TenantOptional()
  @Post('webhook/:provider')
  @HttpCode(200)
  @ApiOperation({ summary: 'Signed provider webhook; safe to receive twice' })
  webhook(
    @Param('provider') provider: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    // The exact bytes, not the parsed body: re-serialising would break the HMAC.
    const raw = req.rawBody?.toString('utf8') ?? '';
    return this.payments.handleWebhook(provider, raw, headers);
  }

  @ApiBearerAuth()
  @Post('orders/:id/collected')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ORDERS_UPDATE)
  @ApiOperation({ summary: 'Record cash collected for a COD order' })
  markCollected(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.markCollected(id);
  }
}
