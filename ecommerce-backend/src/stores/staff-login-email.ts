import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Is this address one that someone signs in to this store with?
 *
 * A shop's public contact address is printed in the storefront footer and at
 * the foot of every order email, so it reaches every shopper and every inbox
 * the shop has ever mailed. A sign-in address published that way is half a
 * credential given away — the half an attacker cannot otherwise guess — and it
 * turns ordinary customer mail into a phishing target aimed at the one account
 * that can change the payment details.
 *
 * The two are separate fields and always have been: provisioning takes the
 * business contact and the owner's login as different inputs. They drift into
 * being the same when whoever fills the form types one address twice, which is
 * exactly what happened on the seeded stores — so this is checked rather than
 * assumed.
 *
 * Scoped to the store's own staff. A coincidental match with someone's login at
 * an unrelated shop is not this shop's problem to solve, and checking every
 * user on the platform would leak whether a given address has an account here.
 */
export async function isStaffLoginEmail(
  prisma: PrismaService,
  tenantId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;

  // TenantUser is platform-managed, so the scope extension does not filter it;
  // `tenantId` is named explicitly here for the same reason it is in
  // StaffService.
  const match = await prisma.runUnscoped((db) =>
    db.tenantUser.findFirst({
      where: {
        tenantId,
        user: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } },
      },
      select: { id: true },
    }),
  );

  return match !== null;
}
