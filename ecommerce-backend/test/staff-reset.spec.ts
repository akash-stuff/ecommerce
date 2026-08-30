import { AuthService } from '../src/auth/auth.service';

/**
 * The admin console's own password reset.
 *
 * Driven through the real `AuthService` with hand-built doubles rather than a
 * Nest testing module: what is being pinned here is the *decisions* — who is
 * told what, what gets revoked, which challenge completes which reset — and a
 * container would add wiring without adding coverage of any of that.
 */
type Db = Record<string, any>;

function build(overrides: { user?: Db | null } = {}) {
  const calls = {
    userUpdate: [] as Db[],
    tokenRevoke: [] as Db[],
    issued: [] as { email: string; purpose: string; pending: Db | null }[],
    forgotten: [] as { email: string; purpose: string }[],
    emails: [] as Db[],
  };

  const db: Db = {
    user: {
      findUnique: jest.fn(async () =>
        overrides.user === undefined
          ? { id: 'user-1', isActive: true }
          : overrides.user,
      ),
      update: jest.fn(async (args: Db) => {
        calls.userUpdate.push(args);
        return {};
      }),
    },
    refreshToken: {
      updateMany: jest.fn(async (args: Db) => {
        calls.tokenRevoke.push(args);
        return { count: 2 };
      }),
    },
  };

  const prisma = {
    runUnscoped: jest.fn(async (fn: (client: Db) => unknown) => fn(db)),
    db,
  };

  const otp = {
    issue: jest.fn(async (email: string, purpose: string, pending: Db | null) => {
      calls.issued.push({ email, purpose, pending });
      return { code: '408215', challenge: { expiresInSeconds: 600, resendInSeconds: 60 } };
    }),
    consume: jest.fn(
      async (): Promise<Record<string, unknown> | null> => ({ userId: 'user-1' }),
    ),
    forget: jest.fn(async (email: string, purpose: string) => {
      calls.forgotten.push({ email, purpose });
    }),
  };

  const notifications = {
    staffPasswordResetCode: jest.fn(async (to: string, data: Db) => {
      calls.emails.push({ to, ...data });
    }),
  };

  const config = {
    get: jest.fn((key: string) =>
      key === 'platform.domain' ? 'everystore.example' : 'Everystore <no-reply@everystore.example>',
    ),
  };

  const service = new AuthService(
    prisma as never,
    {} as never,
    config as never,
    notifications as never,
    otp as never,
  );

  return { service, calls, otp, notifications, db };
}

describe('asking for an admin reset code', () => {
  /**
   * The whole point of the endpoint's shape. Saying "no such account" would
   * turn this into a way to discover which addresses can administer a store,
   * which is a far better list to hold than the shopper equivalent.
   */
  it('reports success for an address with no account', async () => {
    const { service, calls } = build({ user: null });

    await expect(service.forgotStaffPassword({ email: 'nobody@test' })).resolves.toEqual({
      sent: true,
    });
    expect(calls.emails).toHaveLength(0);
    expect(calls.issued).toHaveLength(0);
  });

  /** Re-enabling an account is somebody's decision, not a reset's side effect. */
  it('reports success, and sends nothing, for a deactivated account', async () => {
    const { service, calls } = build({ user: { id: 'user-1', isActive: false } });

    await expect(service.forgotStaffPassword({ email: 'gone@test' })).resolves.toEqual({
      sent: true,
    });
    expect(calls.emails).toHaveLength(0);
  });

  it('emails a code for a live account', async () => {
    const { service, calls } = build();

    await service.forgotStaffPassword({ email: 'Owner@Test' });

    expect(calls.emails).toHaveLength(1);
    expect(calls.emails[0].to).toBe('owner@test');
    expect(calls.emails[0].code).toBe('408215');
    expect(calls.emails[0].expiresInMinutes).toBe(10);
  });

  /**
   * Sent as the platform, never as a store: staff sign in on a tenant-less
   * host, one login may open several shops, and a platform administrator
   * belongs to none.
   */
  it('sends as the platform rather than as any store', async () => {
    const { service, calls } = build();

    await service.forgotStaffPassword({ email: 'owner@test' });

    expect(calls.emails[0].platformName).toBe('everystore.example');
    // The bare address out of SMTP_FROM, not the whole display-name header.
    expect(calls.emails[0].supportEmail).toBe('no-reply@everystore.example');
  });

  /**
   * A staff challenge must not complete a customer reset, or the other way
   * round: the same person can be a shopper at a store and staff of it.
   */
  it('issues under its own purpose, carrying the account it is for', async () => {
    const { service, calls } = build();

    await service.forgotStaffPassword({ email: 'owner@test' });

    expect(calls.issued[0].purpose).toBe('staff.reset');
    expect(calls.issued[0].pending).toEqual({ userId: 'user-1' });
  });

  /**
   * Otherwise the cooldown on a code that was never delivered locks someone out
   * of asking again for a minute.
   */
  it('drops the challenge when the email fails, so a retry is not blocked', async () => {
    const { service, calls, notifications } = build();
    notifications.staffPasswordResetCode.mockRejectedValueOnce(new Error('smtp down'));

    await expect(service.forgotStaffPassword({ email: 'owner@test' })).resolves.toEqual({
      sent: true,
    });
    expect(calls.forgotten).toContainEqual({ email: 'owner@test', purpose: 'staff.reset' });
  });
});

describe('completing an admin reset', () => {
  const valid = { email: 'owner@test', code: '408215', password: 'a-new-password' };

  it('changes the password on the account the challenge named', async () => {
    const { service, calls } = build();

    await expect(service.resetStaffPassword(valid)).resolves.toEqual({ reset: true });

    expect(calls.userUpdate).toHaveLength(1);
    expect(calls.userUpdate[0].where).toEqual({ id: 'user-1' });
    expect(calls.userUpdate[0].data.passwordHash).toMatch(/^\$argon2id\$/);
  });

  /**
   * A reset is what someone does when they believe another person has their
   * password. Leaving the old refresh tokens alive would make it cosmetic.
   */
  it('revokes every live session for that account', async () => {
    const { service, calls } = build();

    await service.resetStaffPassword(valid);

    expect(calls.tokenRevoke).toHaveLength(1);
    expect(calls.tokenRevoke[0].where).toEqual({ userId: 'user-1', revokedAt: null });
    expect(calls.tokenRevoke[0].data.revokedAt).toBeInstanceOf(Date);
  });

  /** Spaces and dashes are how a code gets copied out of an email. */
  it('accepts a code that was pasted with spacing', async () => {
    const { service, otp } = build();

    await service.resetStaffPassword({ ...valid, code: '408 215' });

    expect(otp.consume).toHaveBeenCalledWith('owner@test', 'staff.reset', '408215');
  });

  /**
   * A challenge with no account on it was not issued by the method above — a
   * customer reset row, say. Refused rather than guessed at.
   */
  it('refuses a challenge that names no account', async () => {
    const { service, otp, calls } = build();
    otp.consume.mockResolvedValueOnce(null);

    await expect(service.resetStaffPassword(valid)).rejects.toMatchObject({
      response: { code: 'OTP_INVALID' },
    });
    expect(calls.userUpdate).toHaveLength(0);
    expect(calls.tokenRevoke).toHaveLength(0);
  });

  it('does not change anything when the code is wrong', async () => {
    const { service, otp, calls } = build();
    otp.consume.mockRejectedValueOnce(new Error('OTP_INVALID'));

    await expect(service.resetStaffPassword(valid)).rejects.toThrow();
    expect(calls.userUpdate).toHaveLength(0);
    expect(calls.tokenRevoke).toHaveLength(0);
  });

  /** Spent, so the same code cannot be replayed into a second reset. */
  it('clears the challenge once it has been used', async () => {
    const { service, calls } = build();

    await service.resetStaffPassword(valid);

    expect(calls.forgotten).toContainEqual({ email: 'owner@test', purpose: 'staff.reset' });
  });

  /**
   * Deliberately no tokens: a staff session carries a tenant chosen at sign-in,
   * and someone who staffs three stores has no obvious one to be dropped into.
   */
  it('returns no session, so the caller signs in again', async () => {
    const { service } = build();

    const result = await service.resetStaffPassword(valid);

    expect(result).toEqual({ reset: true });
    expect(result).not.toHaveProperty('accessToken');
  });
});
