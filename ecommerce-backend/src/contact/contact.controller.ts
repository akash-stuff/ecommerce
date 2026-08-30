import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { Public, TenantOptional } from '../common/decorators';
import { ContactEnquiryDto } from './dto/contact.dto';

/**
 * The contact form on the platform's landing page.
 *
 * `@TenantOptional` rather than `@PlatformOnly`: the page is served on the
 * platform's own hostnames, where no tenant resolves, but @PlatformOnly also
 * demands SUPER_ADMIN — and a form that only the platform owner can submit is
 * not a contact form.
 */
@ApiTags('Contact')
@Controller('contact')
@TenantOptional()
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /**
   * Throttled harder than the newsletter's three a minute.
   *
   * This is anonymous, it carries two thousand characters of free text, and it
   * causes an email to be sent to a fixed address — which is the shape of a
   * mail relay if it is left open. Two a minute is more than a person filling a
   * form in needs and far less than an abuser wants.
   */
  @Public()
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Send an enquiry to the platform' })
  submit(@Body() dto: ContactEnquiryDto) {
    return this.contact.submit(dto);
  }
}
