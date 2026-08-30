import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateStorefrontDto } from '../src/theme/dto/theme.dto';
import { UpdateInvoiceSettingsDto } from '../src/invoices/dto/invoice.dto';

/**
 * How a shop says where to reach it.
 *
 * Two dtos, deliberately not the same rules. The store's own email is printed
 * in the storefront footer and at the foot of every order email, and its column
 * is NOT NULL — so it can be corrected but never emptied. The invoice override
 * beside it can be emptied, because emptying it is how a shop goes back to
 * using the store address on its invoices.
 *
 * Both are checked as addresses rather than taken as free text. Before this,
 * `@IsString()` was the whole check on the invoice one, and "accounts@" was a
 * value the form accepted and printed on every tax document the shop issued.
 */
const OPTIONS = { enableImplicitConversion: false };

const errorsFor = (cls: any, plain: Record<string, unknown>) =>
  validateSync(plainToInstance(cls, plain, OPTIONS), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((e) => Object.values(e.constraints ?? {}));

describe("the store's own contact details", () => {
  it('accepts an address and a number a shopper could use', () => {
    expect(
      errorsFor(UpdateStorefrontDto, {
        email: 'hello@northwind.example',
        phone: '+91 80 4000 1234',
        addressLine1: '14 Residency Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560025',
      }),
    ).toEqual([]);
  });

  it('leaves every field alone when it is absent', () => {
    expect(errorsFor(UpdateStorefrontDto, { name: 'Northwind' })).toEqual([]);
  });

  it('refuses an email that is not one', () => {
    expect(errorsFor(UpdateStorefrontDto, { email: 'accounts@' })).toHaveLength(1);
    expect(errorsFor(UpdateStorefrontDto, { email: 'not an address' })).toHaveLength(1);
  });

  /**
   * The one field on this form that cannot be cleared. A published storefront
   * with no address in its footer is a shop with no way to reach it.
   */
  it('refuses to empty the contact email', () => {
    expect(errorsFor(UpdateStorefrontDto, { email: '' })).toHaveLength(1);
  });

  it('lets the phone number be emptied, which is how it is removed', () => {
    expect(errorsFor(UpdateStorefrontDto, { phone: '' })).toEqual([]);
    expect(errorsFor(UpdateStorefrontDto, { addressLine2: '' })).toEqual([]);
    expect(errorsFor(UpdateStorefrontDto, { city: '' })).toEqual([]);
  });

  it('refuses a phone number too short or too long to be one', () => {
    expect(errorsFor(UpdateStorefrontDto, { phone: '123' })).toHaveLength(1);
    expect(errorsFor(UpdateStorefrontDto, { phone: '9'.repeat(21) })).toHaveLength(1);
  });

  it('still refuses a key it does not know', () => {
    expect(errorsFor(UpdateStorefrontDto, { tenantId: 'sneaky' })).toHaveLength(1);
  });
});

describe('the billing overrides printed on an invoice', () => {
  it('accepts an address and a number', () => {
    expect(
      errorsFor(UpdateInvoiceSettingsDto, {
        email: 'billing@northwind.example',
        phone: '+91 80 4000 1234',
      }),
    ).toEqual([]);
  });

  /**
   * Empty is not missing here: it is the instruction to stop overriding and go
   * back to the store's own details, which is what the service stores as null.
   */
  it('accepts an empty value, which restores the store detail', () => {
    expect(errorsFor(UpdateInvoiceSettingsDto, { email: '', phone: '' })).toEqual([]);
  });

  it('refuses an email that would bounce', () => {
    expect(errorsFor(UpdateInvoiceSettingsDto, { email: 'accounts@' })).toHaveLength(1);
  });

  it('holds a phone number to the same length as everywhere else', () => {
    expect(errorsFor(UpdateInvoiceSettingsDto, { phone: '123' })).toHaveLength(1);
    expect(errorsFor(UpdateInvoiceSettingsDto, { phone: '9'.repeat(21) })).toHaveLength(1);
  });
});
