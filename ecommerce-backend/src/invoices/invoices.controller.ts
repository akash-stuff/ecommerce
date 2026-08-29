import { Controller, Get, Param, ParseUUIDPipe, Put, Body, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { InvoicesService, type RenderedInvoice } from './invoices.service';
import { RequirePermissions, SkipResponseWrap } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { UpdateInvoiceSettingsDto } from './dto/invoice.dto';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /**
   * The shopper's own invoice, by order number.
   *
   * Declared before the settings routes have any chance to collide, and scoped
   * by customer id inside the service — there is no permission on it because a
   * customer token carries none, and the ownership check is what authorises it.
   */
  @Get('orders/mine/:orderNumber')
  @SkipResponseWrap()
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: "Download your own order's invoice as a PDF" })
  async mine(
    @Param('orderNumber') orderNumber: string,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.invoices.forCustomer(orderNumber));
  }

  @Get('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  @ApiOperation({ summary: 'Business details and GST printed on every invoice' })
  getSettings() {
    return this.invoices.getSettings();
  }

  @Put('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Update the invoicing details; blank restores a fallback' })
  updateSettings(@Body() dto: UpdateInvoiceSettingsDto) {
    return this.invoices.updateSettings(dto);
  }

  @Get('orders/:id')
  @SkipResponseWrap()
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: "Download a customer's invoice from the admin console" })
  async forOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.invoices.forStaff(id));
  }
}

/**
 * `@Res()` rather than a returned stream: this is the one place in the API that
 * answers with bytes instead of JSON, and the response interceptor is opted out
 * of with `@SkipResponseWrap` so a PDF is not wrapped in `{ success, data }`.
 *
 * `attachment` — a shopper who clicks "Download invoice" wants a file on their
 * machine, not a PDF viewer that has replaced the shop they were reading.
 */
function send(res: Response, invoice: RenderedInvoice): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', invoice.pdf.length);
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.filename}"`);
  // An invoice contains a delivery address; no shared cache should hold one.
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(invoice.pdf);
}
