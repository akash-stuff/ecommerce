import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

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
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

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
        from: this.from,
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
