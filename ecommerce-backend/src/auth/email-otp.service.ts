import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';

/** Digits in an emailed code. Six is the length people expect to retype. */
const CODE_DIGITS = 6;

/**
 * How long a code lives. Long enough to switch to a mail app and back on a slow
 * connection, short enough that a code left in an inbox is not a standing key.
 */
export const OTP_TTL_SECONDS = 10 * 60;

/**
 * Wrong guesses before the challenge is dead.
 *
 * Six digits is a million codes, so brute force is not the threat — but a few
 * thousand tries against a live challenge is, and an attempt cap costs a
 * legitimate typo nothing.
 */
const MAX_ATTEMPTS = 5;

/** Minimum gap between sends, so the endpoint cannot be used to spam an inbox. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * A hash to verify against when there is no challenge, so "no pending
 * registration" costs the same time as "wrong code" and cannot be told apart.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$1Zm5jdGlvbmFsZHVtbXloYXNodmFsdWU';

export interface OtpChallenge {
  /** Seconds until the code expires, for the countdown on the form. */
  expiresInSeconds: number;
  /** Seconds before another code may be requested. */
  resendInSeconds: number;
}

/**
 * Emailed one-time codes.
 *
 * Tenant-scoped throughout: the same address registering at two stores on the
 * platform is two unrelated challenges, because the accounts are unrelated.
 */
@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues a code and returns it, along with what the caller should tell the
   * browser. The plaintext code is returned so the caller can email it — it is
   * never stored and never logged.
   */
  async issue(
    email: string,
    purpose: string,
    pending: Record<string, unknown> | null,
  ): Promise<{ code: string; challenge: OtpChallenge }> {
    const address = email.toLowerCase();

    const existing = await this.prisma.db.emailOtp.findFirst({
      where: { email: address, purpose },
      select: { id: true, createdAt: true, consumedAt: true },
    });

    /**
     * Cooldown applies to a live challenge only. Refusing outright rather than
     * silently ignoring the request: a form that says "sent!" and did nothing
     * leaves someone waiting for an email that is not coming.
     */
    if (existing && !existing.consumedAt) {
      const age = (Date.now() - existing.createdAt.getTime()) / 1000;
      if (age < RESEND_COOLDOWN_SECONDS) {
        // Nest has no TooManyRequestsException, so the status is given directly
        // rather than borrowing a wrong one — a client that retries on 400 and
        // backs off on 429 needs to be told which this is.
        throw new HttpException(
          {
            message: `A code was just sent. Try again in ${Math.ceil(
              RESEND_COOLDOWN_SECONDS - age,
            )} seconds.`,
            code: 'OTP_COOLDOWN',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // `randomInt` rather than Math.random: this is a credential.
    const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
    const codeHash = await argon2.hash(code, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    const data = {
      email: address,
      purpose,
      codeHash,
      pending: (pending ?? undefined) as Prisma.InputJsonValue | undefined,
      attempts: 0,
      expiresAt,
      consumedAt: null,
    };

    if (existing) {
      // Replaced, not added to: a resend must invalidate the previous code, or
      // several are valid at once and the attempt cap means less.
      await this.prisma.db.emailOtp.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.db.emailOtp.create({
        // tenantId is stamped by the tenant-scope extension.
        data: data as unknown as Prisma.EmailOtpCreateInput,
      });
    }

    return {
      code,
      challenge: {
        expiresInSeconds: OTP_TTL_SECONDS,
        resendInSeconds: RESEND_COOLDOWN_SECONDS,
      },
    };
  }

  /**
   * Checks a code and spends it. Returns the pending payload the challenge was
   * carrying, so the caller can complete whatever it was for.
   *
   * Every failure — no challenge, expired, too many attempts, wrong code —
   * answers the same way. Distinguishing them would say whether an address has
   * a registration in progress.
   */
  async consume(
    email: string,
    purpose: string,
    code: string,
  ): Promise<Record<string, unknown> | null> {
    const address = email.toLowerCase();

    const row = await this.prisma.db.emailOtp.findFirst({
      where: { email: address, purpose },
    });

    const usable =
      row && !row.consumedAt && row.expiresAt > new Date() && row.attempts < MAX_ATTEMPTS;

    // Verified even when unusable, so the response time does not reveal which.
    const valid = await argon2
      .verify(usable ? row!.codeHash : DUMMY_HASH, code)
      .catch(() => false);

    if (!usable || !valid) {
      // Counted before refusing, so guesses against a live challenge run out.
      if (row && !row.consumedAt) {
        await this.prisma.db.emailOtp.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 } },
        });
      }
      throw new BadRequestException({
        message: 'That code is not valid or has expired. Request a new one.',
        code: 'OTP_INVALID',
      });
    }

    await this.prisma.db.emailOtp.update({
      where: { id: row!.id },
      data: { consumedAt: new Date() },
    });

    return (row!.pending ?? null) as Record<string, unknown> | null;
  }

  /** Drops a spent or expired challenge. Best effort; a leftover row is inert. */
  async forget(email: string, purpose: string): Promise<void> {
    await this.prisma.db.emailOtp
      .deleteMany({ where: { email: email.toLowerCase(), purpose } })
      .catch((error: Error) => {
        this.logger.warn(`Could not clear OTP for ${purpose}: ${error.message}`);
      });
  }
}
