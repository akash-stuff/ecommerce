import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { fromHeader } from './mail-address';

export type SendResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

/**
 * SMTP delivery.
 *
 * With no SMTP host configured this reports `sent: false` with a reason rather
 * than pretending. Development rule 18 — no fake APIs — matters most here,
 * because a mailer that silently swallows messages looks identical to one that
 * works right up until a customer says they never got their receipt.
 *
 * In development the message body is logged instead, so the content can be
 * checked without standing up a mail server.
 */
@Injectable()
export class MailerService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * Says at boot what the mailer will actually do, and warns about the one
   * Gmail misconfiguration that fails silently.
   *
   * Gmail rewrites a From address the account is not authorised to use to the
   * authenticated account itself. Nothing errors — receipts simply arrive from
   * a different sender than intended, which is usually discovered by a customer
   * rather than by whoever set it up.
   */
  onModuleInit(): void {
    if (!this.isConfigured()) {
      this.logger.warn('SMTP is not configured — email will be logged, not sent.');
      return;
    }

    const host = this.config.get<string>('smtp.host') ?? '';
    const user = this.config.get<string>('smtp.user');
    this.logger.log(`Email will be sent via ${host} as ${this.from}`);

    /**
     * A From with no address at all — a bare display name like
     * `No-reply My Store`. It looks configured, and it is not: SMTP needs an
     * address, so the message is either refused or silently re-addressed. The
     * RFC 5322 form is `Display Name <address@example.com>`.
     */
    if (!/@/.test(this.from)) {
      this.logger.error(
        `SMTP_FROM ("${this.from}") contains no email address. Use ` +
          `'Display Name <${user ?? 'you@example.com'}>', or leave it blank to send as SMTP_USER.`,
      );
    }

    const gmail = /(^|\.)gmail\.com$|(^|\.)googlemail\.com$/i.test(host);
    if (gmail && user && !this.from.toLowerCase().includes(user.toLowerCase())) {
      this.logger.warn(
        `SMTP_FROM (${this.from}) is not SMTP_USER (${user}). Gmail will rewrite ` +
          'the sender to the authenticated account unless it is a verified alias.',
      );
    }
    if (gmail && !this.config.get<string>('smtp.password')) {
      this.logger.warn(
        'Gmail needs an App Password, not the account password, and SMTP_PASSWORD is empty.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('smtp.host'));
  }

  private get from(): string {
    return this.config.get<string>('smtp.from') ?? 'no-reply@example.com';
  }

  private transport(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.config.getOrThrow<string>('smtp.host'),
        port: this.config.get<number>('smtp.port', 587),
        // 465 is implicit TLS; everything else upgrades with STARTTLS.
        secure: this.config.get<number>('smtp.port', 587) === 465,
        auth: this.config.get<string>('smtp.user')
          ? {
              user: this.config.get<string>('smtp.user'),
              pass: this.config.get<string>('smtp.password'),
            }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    /**
     * The store's name, shown in front of the configured address.
     *
     * Only the display name changes; the address is left exactly as configured,
     * because rewriting it would break SPF and DKIM alignment for every tenant.
     * See `fromHeader`.
     */
    fromName?: string;
  }): Promise<SendResult> {
    if (!this.isConfigured()) {
      // Logged in full so the content is reviewable without a mail server, and
      // reported as unsent so nothing downstream records a delivery.
      this.logger.warn(
        `SMTP is not configured — no email sent. Would have sent to ${message.to}: "${message.subject}"`,
      );
      this.logger.debug(message.text);
      return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
    }

    try {
      const info = await this.transport().sendMail({
        from: fromHeader(this.from, message.fromName),
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
      });

      return { sent: true, messageId: info.messageId };
    } catch (error) {
      const reason = (error as Error).message;
      this.logger.error(`Email to ${message.to} failed: ${reason}`);
      return { sent: false, reason };
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter?.close();
  }
}
