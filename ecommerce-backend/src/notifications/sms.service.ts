import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel } from '@prisma/client';
import type { SendResult } from './mailer.service';

/**
 * SMS and WhatsApp, over Twilio's REST API.
 *
 * Signed and sent with `fetch` rather than the Twilio SDK, for the same reason
 * the Razorpay provider does: it is one authenticated form POST, and the SDK is
 * a large dependency for that.
 *
 * The two channels are one class because Twilio treats them as one endpoint —
 * a WhatsApp message is the same request with `whatsapp:` prefixed on both
 * numbers. Splitting them would duplicate the transport to express a
 * distinction the provider does not make.
 *
 * With no credentials this reports `sent: false` with a reason and logs the
 * message it would have sent, exactly as MailerService does. A messaging client
 * that silently swallows sends is indistinguishable from a working one until a
 * customer says they were never told their order shipped.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  private get accountSid(): string {
    return this.config.get<string>('twilio.accountSid') ?? '';
  }

  private get authToken(): string {
    return this.config.get<string>('twilio.authToken') ?? '';
  }

  private from(channel: NotificationChannel): string {
    return channel === NotificationChannel.WHATSAPP
      ? this.config.get<string>('twilio.whatsappFrom') ?? ''
      : this.config.get<string>('twilio.smsFrom') ?? '';
  }

  /** Per channel: SMS may be configured while WhatsApp is not, and vice versa. */
  isConfigured(channel: NotificationChannel): boolean {
    return Boolean(this.accountSid && this.authToken && this.from(channel));
  }

  async send(message: {
    to: string;
    body: string;
    channel: NotificationChannel;
  }): Promise<SendResult> {
    const { channel } = message;

    if (!this.isConfigured(channel)) {
      this.logger.warn(
        `${channel} is not configured — nothing sent. Would have sent to ${message.to}.`,
      );
      this.logger.debug(message.body);
      return { sent: false, reason: `${channel}_NOT_CONFIGURED` };
    }

    const to = this.toE164(message.to);
    if (!to) {
      // Not an error worth retrying: the number will still be unusable next
      // time, so it is recorded as a permanent failure with a clear reason.
      return { sent: false, reason: 'INVALID_PHONE_NUMBER' };
    }

    const prefix = channel === NotificationChannel.WHATSAPP ? 'whatsapp:' : '';
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: `${prefix}${to}`,
            From: `${prefix}${this.from(channel)}`,
            Body: message.body,
          }),
        },
      );

      const payload = (await response.json()) as { sid?: string; message?: string };

      if (!response.ok) {
        const reason = payload.message ?? `Twilio returned ${response.status}`;
        this.logger.error(`${channel} to ${to} failed: ${reason}`);
        return { sent: false, reason };
      }

      return { sent: true, messageId: payload.sid ?? 'unknown' };
    } catch (error) {
      const reason = (error as Error).message;
      this.logger.error(`${channel} to ${message.to} failed: ${reason}`);
      return { sent: false, reason };
    }
  }

  /**
   * Twilio requires E.164. Stores collect phone numbers however customers type
   * them, so separators are stripped and a configured default country code is
   * applied to a bare national number. Anything still not plausible is refused
   * rather than sent and billed for a guaranteed failure.
   */
  private toE164(raw: string): string | null {
    const cleaned = raw.replace(/[\s()\-.]/g, '');

    if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;

    const country = this.config.get<string>('twilio.defaultCountryCode') ?? '';
    if (country && /^\d{6,14}$/.test(cleaned)) {
      // A leading zero is a national trunk prefix and is not part of E.164.
      const national = cleaned.replace(/^0+/, '');
      const candidate = `${country}${national}`;
      if (/^\+[1-9]\d{7,14}$/.test(candidate)) return candidate;
    }

    this.logger.warn(`Skipping message: "${raw}" is not a usable phone number.`);
    return null;
  }
}
