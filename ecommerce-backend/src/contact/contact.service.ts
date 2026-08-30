import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { MailerService } from '../notifications/mailer.service';
import { platformEnquiry } from './contact-template';
import { ContactEnquiryDto } from './dto/contact.dto';

/**
 * Where an enquiry from the platform's front page goes.
 *
 * A constant rather than a setting. This is the platform's own inbox — not a
 * tenant's, and not something a store owner or a signed-in operator can point
 * somewhere else — so there is no screen that changes it and no environment
 * variable that could quietly redirect it in one deployment. Changing it is a
 * change to this line, reviewed like any other.
 */
export const ENQUIRY_RECIPIENT = 'mail2vakash@gmail.com';

/**
 * The contact form on the landing page.
 *
 * Nothing is written to the database. A `Notification` row belongs to a tenant
 * and is scoped by one, and an enquiry from a stranger has no tenant — inventing
 * one to hold this would put unauthenticated text inside the tenant tables. The
 * mail is the record; a failure to send is reported to the sender rather than
 * swallowed, because there is no other copy of what they wrote.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly mailer: MailerService) {}

  async submit(dto: ContactEnquiryDto): Promise<{ sent: true }> {
    /**
     * Accepted, and dropped.
     *
     * A bot that filled the hidden field is told the same thing a person is
     * told, because an error here is the feedback it needs to get past the
     * check next time.
     */
    if (dto.honeypot?.trim()) {
      this.logger.warn(`Contact form honeypot filled by ${dto.email} — discarded.`);
      return { sent: true };
    }

    const { subject, html, text } = platformEnquiry(dto);

    const result = await this.mailer.send({
      to: ENQUIRY_RECIPIENT,
      subject,
      html,
      text,
      /**
       * Reply-To is the sender; From stays the configured address.
       *
       * Sending *as* the enquirer would fail SPF and DKIM for their domain and
       * land the mail in spam, which is the one outcome that makes a contact
       * form worse than no contact form. Hitting reply still writes to them.
       */
      replyTo: dto.email,
      fromName: 'Everystore enquiries',
    });

    if (!result.sent) {
      /**
       * Told plainly, and logged with the message in it.
       *
       * With no SMTP host configured the mailer reports rather than pretends —
       * so on a platform that has not been set up, this endpoint says so instead
       * of thanking someone for a message that went nowhere. The full text is in
       * the mailer's own warning, so nothing they typed is lost from the log.
       */
      this.logger.error(`Contact enquiry from ${dto.email} was not sent: ${result.reason}`);
      throw new ServiceUnavailableException({
        message: 'We could not send that just now. Please email us directly instead.',
        code: 'ENQUIRY_NOT_SENT',
      });
    }

    this.logger.log(`Contact enquiry from ${dto.email} sent to ${ENQUIRY_RECIPIENT}`);
    return { sent: true };
  }
}
