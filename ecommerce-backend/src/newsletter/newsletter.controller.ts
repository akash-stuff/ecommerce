import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NewsletterService } from './newsletter.service';
import { Public, RequirePermissions, SkipResponseWrap } from '../common/decorators';
import { PERMISSIONS } from '../common/rbac/permissions';
import { SubscribeDto, SubscriberQueryDto } from './dto/newsletter.dto';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  /**
   * The storefront panel posts here.
   *
   * Throttled like the other public write endpoints that send an email. Without
   * a limit this is an open relay for one message per request at someone else's
   * address, and the confirmation mail is what makes that worth abusing.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('subscribe')
  @ApiOperation({ summary: 'Join this store’s mailing list' })
  subscribe(@Body() dto: SubscribeDto) {
    return this.newsletter.subscribe(dto);
  }

  /**
   * Before `:id` routes, and a plain path rather than `admin` — a subscriber
   * list is customer data, so it reuses the customers permissions instead of
   * inventing a grant that no existing role would have.
   */
  @ApiBearerAuth()
  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Everyone who has signed up' })
  findAll(@Query() query: SubscriberQueryDto) {
    return this.newsletter.findAll(query);
  }

  @ApiBearerAuth()
  @Get('export.csv')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @SkipResponseWrap()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="subscribers.csv"')
  @ApiOperation({ summary: 'Current subscribers as CSV, for a mail tool' })
  exportCsv() {
    return this.newsletter.exportCsv();
  }

  @ApiBearerAuth()
  @Post(':id/unsubscribe')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOperation({ summary: 'Take an address off the list, keeping the record' })
  unsubscribe(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.unsubscribe(id);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CUSTOMERS_UPDATE)
  @ApiOperation({ summary: 'Delete the record outright' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsletter.remove(id);
  }
}
