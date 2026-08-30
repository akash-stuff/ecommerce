import { CouponsService } from '../src/coupons/coupons.service';

/**
 * Deleting a coupon.
 *
 * The guard is the whole feature. `CouponUsage.coupon` cascades, so removing a
 * redeemed coupon takes the redemption rows with it — the per-customer counts
 * that make "one per customer" mean anything — and nulls `couponId` on every
 * order that used it. None of that is recoverable, and none of it would raise
 * an error at the time.
 */
function build(overrides: { coupon?: Record<string, unknown> | null; redemptions?: number } = {}) {
  const deleted: unknown[] = [];
  const updated: unknown[] = [];

  const db = {
    coupon: {
      findFirst: jest.fn(async () =>
        overrides.coupon === undefined
          ? { id: 'c1', code: 'WELCOME10', isActive: true }
          : overrides.coupon,
      ),
      delete: jest.fn(async (args: unknown) => {
        deleted.push(args);
        return {};
      }),
      update: jest.fn(async (args: unknown) => {
        updated.push(args);
        return { id: 'c1', isActive: false };
      }),
    },
    couponUsage: {
      count: jest.fn(async () => overrides.redemptions ?? 0),
    },
  };

  const service = new CouponsService({ db } as never);
  return { service, db, deleted, updated };
}

describe('deleting a coupon', () => {
  it('removes one that nobody has redeemed', async () => {
    const { service, deleted } = build({ redemptions: 0 });

    await expect(service.remove('c1')).resolves.toBeUndefined();
    expect(deleted).toEqual([{ where: { id: 'c1' } }]);
  });

  /**
   * The case the guard exists for. Refused, and the refusal names both the
   * scale of the problem and the thing to do instead — a console can show that
   * message unedited.
   */
  it('refuses one that has been used, and says what to do instead', async () => {
    const { service, deleted } = build({ redemptions: 3 });

    await expect(service.remove('c1')).rejects.toMatchObject({
      response: {
        code: 'COUPON_IN_USE',
        message: expect.stringContaining('3 orders'),
      },
    });
    expect(deleted).toHaveLength(0);
  });

  it('counts one redemption in the singular', async () => {
    const { service } = build({ redemptions: 1 });

    await expect(service.remove('c1')).rejects.toMatchObject({
      response: { message: expect.stringContaining('1 order and') },
    });
  });

  it('names the coupon in the refusal, not just its id', async () => {
    const { service } = build({ redemptions: 2 });

    await expect(service.remove('c1')).rejects.toMatchObject({
      response: { message: expect.stringContaining('WELCOME10') },
    });
  });

  /**
   * Counted from the usage rows rather than read off `Coupon.usageCount`. The
   * counter is maintained by the redemption path; the rows are the record, and
   * if the two disagree, refusing is the safe way to be wrong.
   */
  it('counts the usage rows rather than trusting the cached counter', async () => {
    const { service, db, deleted } = build({
      coupon: { id: 'c1', code: 'WELCOME10', usageCount: 0 },
      redemptions: 5,
    });

    await expect(service.remove('c1')).rejects.toMatchObject({
      response: { code: 'COUPON_IN_USE' },
    });
    expect(db.couponUsage.count).toHaveBeenCalledWith({ where: { couponId: 'c1' } });
    expect(deleted).toHaveLength(0);
  });

  it('refuses a coupon that does not exist rather than reporting success', async () => {
    const { service } = build({ coupon: null });

    await expect(service.remove('nope')).rejects.toMatchObject({
      response: { code: 'COUPON_NOT_FOUND' },
    });
  });
});

describe('switching a coupon on and off', () => {
  /** The reversible control, and the one a used coupon is left with. */
  it('switches off without touching the coupon itself', async () => {
    const { service, updated, deleted } = build({ redemptions: 99 });

    await service.setActive('c1', false);

    expect(updated).toEqual([{ where: { id: 'c1' }, data: { isActive: false } }]);
    expect(deleted).toHaveLength(0);
  });

  it('switches back on again', async () => {
    const { service, updated } = build();

    await service.setActive('c1', true);

    expect(updated).toEqual([{ where: { id: 'c1' }, data: { isActive: true } }]);
  });
});
