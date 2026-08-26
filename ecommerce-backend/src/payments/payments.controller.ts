import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { GatewaysService } from './gateways.service';
import { Public, RequirePermissions, TenantOptional } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { ConfirmPaymentDto, InitiatePaymentDto } from './dto/payment.dto';
import { UpsertGatewayDto } from './dto/gateway.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly gateways: GatewaysService,
  ) {}

  /**
   * This store's gateway setup, for its own admin.
   *
   * Secrets are never in the response — only which fields hold a value. A
   * settings screen that renders a live key secret has copied it into browser
   * history, screenshots and every support ticket that includes one.
   */
  @ApiBearerAuth()
  @Get('gateways')
  @RequirePermissions(PERMISSIONS.PAYMENTS_MANAGE)
  @ApiOperation({ summary: 'Payment methods this store has set up' })
  listGateways() {
    return this.gateways.list();
  }

  @ApiBearerAuth()
  @Put('gateways/:provider')
  @RequirePermissions(PERMISSIONS.PAYMENTS_MANAGE)
  @ApiOperation({
    summary: 'Connect or edit one payment method',
    description:
      'Secrets are encrypted at rest. Omit a secret to keep the stored value; ' +
      'send an empty string to clear it.',
  })
  upsertGateway(@Param('provider') provider: string, @Body() dto: UpsertGatewayDto) {
    return this.gateways.upsert(provider, dto);
  }

  @ApiBearerAuth()
  @Delete('gateways/:provider')
  @RequirePermissions(PERMISSIONS.PAYMENTS_MANAGE)
  @ApiOperation({ summary: 'Forget the stored credentials for one method' })
  disconnectGateway(@Param('provider') provider: string) {
    return this.gateways.disconnect(provider);
  }

  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'Payment methods this store can actually accept' })
  async providers() {
    return { providers: await this.payments.availableProviders() };
  }

  @Public()
  @Post('initiate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start a payment attempt for an existing order' })
  initiate(@Body() dto: InitiatePaymentDto) {
    return this.payments.initiate(dto.orderNumber, dto.provider);
  }

  /**
   * The browser reporting a completed payment.
   *
   * Public, because the shopper who just paid may well be a guest. The
   * signature in the payload is what authenticates it — see
   * `PaymentsService.confirmReturn`.
   */
  @Public()
  @Post('confirm')
  @HttpCode(200)
  @ApiOperation({ summary: "Confirm a payment from the gateway's browser return" })
  confirm(@Body() dto: ConfirmPaymentDto) {
    return this.payments.confirmReturn(dto.orderNumber, dto.provider, dto.payload);
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
