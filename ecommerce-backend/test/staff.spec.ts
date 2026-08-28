import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SystemRole } from '@prisma/client';
import { CreateStaffDto, UpdateStaffDto, ASSIGNABLE_ROLES } from '../src/staff/dto/staff.dto';
import { staffInvited } from '../src/notifications/templates';
import { resolvePermissions, PERMISSIONS } from '../src/common/rbac/permissions';

const OPTIONS = { enableImplicitConversion: false };

const errorsFor = (cls: any, plain: Record<string, unknown>) =>
  validateSync(plainToInstance(cls, plain, OPTIONS), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((e) => Object.values(e.constraints ?? {}));

const valid = {
  email: 'sam@example.com',
  firstName: 'Sam',
  lastName: 'Doe',
  role: SystemRole.STAFF,
};

describe('adding a staff member', () => {
  it('accepts an administrator or a staff member', () => {
    for (const role of ASSIGNABLE_ROLES) {
      expect(errorsFor(CreateStaffDto, { ...valid, role })).toEqual([]);
    }
  });

  /**
   * The owner is created with the store and is the only role that can connect
   * the bank account. If this screen could mint another one, the distinction
   * between owner and administrator would not survive first contact.
   */
  it('refuses to mint another owner', () => {
    const messages = errorsFor(CreateStaffDto, { ...valid, role: SystemRole.TENANT_OWNER });
    expect(messages).toContain('Choose either Administrator or Staff.');
  });

  it('refuses a super admin or a customer as a store role', () => {
    for (const role of [SystemRole.SUPER_ADMIN, SystemRole.CUSTOMER]) {
      expect(errorsFor(CreateStaffDto, { ...valid, role }).length).toBeGreaterThan(0);
    }
  });

  /**
   * The address is the login. `Sam@Example.COM` and `sam@example.com` must be
   * one account, or the second invite silently creates a duplicate person that
   * the unique index on User.email would then reject.
   */
  it('normalises the address it will be signed in with', () => {
    const dto = plainToInstance(CreateStaffDto, { ...valid, email: '  Sam@Example.COM ' }, OPTIONS);
    expect(dto.email).toBe('sam@example.com');
  });

  it('rejects an address nobody could receive an invite at', () => {
    expect(errorsFor(CreateStaffDto, { ...valid, email: 'not-an-address' })).toContain(
      'Enter the email address they will sign in with.',
    );
  });

  it('will not let a caller smuggle in extra fields', () => {
    // `whitelist` + `forbidNonWhitelisted` is what stops `isActive: true` or a
    // permissions array arriving on the create call.
    expect(errorsFor(CreateStaffDto, { ...valid, permissions: ['staff.manage'] }).length)
      .toBeGreaterThan(0);
  });
});

describe('editing a staff member', () => {
  it('allows a role change, a suspension, or neither', () => {
    expect(errorsFor(UpdateStaffDto, {})).toEqual([]);
    expect(errorsFor(UpdateStaffDto, { isActive: false })).toEqual([]);
    expect(errorsFor(UpdateStaffDto, { role: SystemRole.TENANT_ADMIN })).toEqual([]);
  });

  it('still refuses owner as a target role', () => {
    expect(errorsFor(UpdateStaffDto, { role: SystemRole.TENANT_OWNER }).length).toBeGreaterThan(0);
  });
});

/**
 * The roles are only meaningful if they actually differ. These pin the two
 * grants that decide whether "staff" is a safe thing to hand out.
 */
describe('what each role can do', () => {
  const staff = resolvePermissions(SystemRole.STAFF);
  const admin = resolvePermissions(SystemRole.TENANT_ADMIN);
  const owner = resolvePermissions(SystemRole.TENANT_OWNER);

  it('lets staff read the catalogue and work orders', () => {
    expect(staff).toContain(PERMISSIONS.ORDERS_READ);
    expect(staff).toContain(PERMISSIONS.ORDERS_UPDATE);
    expect(staff).toContain(PERMISSIONS.PRODUCTS_READ);
  });

  it('does not let staff edit the catalogue, the theme or the payment keys', () => {
    expect(staff).not.toContain(PERMISSIONS.PRODUCTS_UPDATE);
    expect(staff).not.toContain(PERMISSIONS.THEME_UPDATE);
    expect(staff).not.toContain(PERMISSIONS.PAYMENTS_MANAGE);
  });

  /**
   * Only the owner adds people. An administrator who could manage staff could
   * appoint themselves a second account with more rights, so this is the line
   * that keeps the roles apart.
   */
  it('reserves adding staff and connecting the bank account to the owner', () => {
    expect(owner).toContain(PERMISSIONS.STAFF_MANAGE);
    expect(owner).toContain(PERMISSIONS.PAYMENTS_MANAGE);
    expect(admin).not.toContain(PERMISSIONS.STAFF_MANAGE);
    expect(admin).not.toContain(PERMISSIONS.PAYMENTS_MANAGE);
  });

  it('never grants a platform permission through a store membership', () => {
    for (const role of [SystemRole.TENANT_OWNER, SystemRole.TENANT_ADMIN, SystemRole.STAFF]) {
      expect(resolvePermissions(role).some((p) => p.startsWith('platform.'))).toBe(false);
    }
    // Even when someone tries to grant one explicitly.
    expect(resolvePermissions(SystemRole.TENANT_OWNER, ['platform.tenants.manage']))
      .not.toContain('platform.tenants.manage');
  });
});

describe('the invite email', () => {
  const data = {
    storeName: 'Northwind',
    storeEmail: 'hi@northwind.test',
    firstName: 'Sam',
    role: 'Staff',
    signInUrl: 'https://admin.northwind.test/login',
  };

  /**
   * The one that matters. `deliverEmail` stores the rendered body so a failed
   * send can be replayed — so a password in this template would be a working
   * credential sitting in the notifications table forever, readable from the
   * Notifications screen. It is shown to the administrator once instead.
   */
  it('carries no password', () => {
    const mail = staffInvited(data);
    expect(mail.html).toMatch(/not sent by email/i);
    expect(mail.text).toMatch(/not sent by email/i);
    expect(mail.html).not.toMatch(/password:\s*\S/i);
  });

  it('tells them where to sign in and as what', () => {
    const mail = staffInvited(data);
    expect(mail.text).toContain('https://admin.northwind.test/login');
    expect(mail.text).toContain('Staff');
  });

  it('escapes a store name, which an owner types in', () => {
    const mail = staffInvited({ ...data, storeName: '<script>alert(1)</script>' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
