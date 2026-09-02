import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateStoreRequestDto,
  RejectStoreRequestDto,
} from '../src/store-requests/dto/store-request.dto';
import {
  applicationReceived,
  applicationRejected,
  newApplication,
  APPLICATION_INBOX,
} from '../src/store-requests/store-request-template';

/**
 * Registering is the second endpoint an anonymous stranger can write to, and
 * the only one that asks for a password and a hostname. Both are checked here
 * as rules rather than as behaviour: the slug becomes an address that can never
 * be changed, and the password floor is what a store owner's login is worth.
 */
const errorsFor = (cls: any, plain: Record<string, unknown>) =>
  validateSync(plainToInstance(cls, plain, { enableImplicitConversion: false }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((e) => Object.values(e.constraints ?? {}));

const application = (over: Record<string, unknown> = {}) => ({
  businessName: 'Northwind Apparel',
  slug: 'northwind',
  firstName: 'Priya',
  lastName: 'Raman',
  email: 'priya@northwind.example',
  password: 'a-long-enough-one',
  ...over,
});

describe('applying for a store', () => {
  it('accepts a business, an address and somebody to own it', () => {
    expect(errorsFor(CreateStoreRequestDto, application())).toEqual([]);
  });

  it('takes the optional details when they are offered', () => {
    expect(
      errorsFor(
        CreateStoreRequestDto,
        application({
          phone: '+91 80 4000 1234',
          businessCategory: 'Fashion',
          message: 'We run four shops and want to move off spreadsheets.',
        }),
      ),
    ).toEqual([]);
  });

  /**
   * The slug becomes the hostname and is the one field that can never be
   * changed afterwards, so what this accepts, provisioning must accept too.
   *
   * Case is the one thing it is softer about than `CreateTenantDto`: the
   * console refuses "Northwind" outright, this lowercases it. A public form is
   * not the place to reject somebody over a capital letter, and the value that
   * reaches provisioning is normalised either way.
   */
  it('holds the address to the shape a hostname can take', () => {
    for (const slug of ['north wind', 'north_wind', '-northwind', 'northwind-', 'a']) {
      expect(errorsFor(CreateStoreRequestDto, application({ slug }))).toHaveLength(1);
    }
    for (const slug of ['northwind', 'north-wind-2', 'n0rthwind']) {
      expect(errorsFor(CreateStoreRequestDto, application({ slug }))).toEqual([]);
    }
  });

  it('lowercases and trims the address rather than refusing it', () => {
    const dto = plainToInstance(CreateStoreRequestDto, application({ slug: '  NorthWind  ' }));
    expect(dto.slug).toBe('northwind');
  });

  /** Ten characters, the same floor the console's own create form uses. */
  it('refuses a password shorter than an owner password may be', () => {
    expect(errorsFor(CreateStoreRequestDto, application({ password: 'short' }))).toHaveLength(1);
    expect(errorsFor(CreateStoreRequestDto, application({ password: 'x'.repeat(10) }))).toEqual([]);
  });

  it('refuses an address it could not write back to', () => {
    expect(errorsFor(CreateStoreRequestDto, application({ email: 'priya@' }))).toHaveLength(1);
  });

  it('still refuses a key it does not know', () => {
    expect(errorsFor(CreateStoreRequestDto, application({ status: 'APPROVED' }))).toHaveLength(1);
    expect(errorsFor(CreateStoreRequestDto, application({ tenantId: 'sneaky' }))).toHaveLength(1);
  });

  /**
   * A refusal is read by the person it is about, so it cannot be blank. "Your
   * application was unsuccessful" with no reason is the message that generates
   * a reply asking why.
   */
  it('will not refuse an application without saying why', () => {
    expect(errorsFor(RejectStoreRequestDto, { reason: '' })).toHaveLength(1);
    expect(errorsFor(RejectStoreRequestDto, { reason: 'no' })).toHaveLength(1);
    expect(errorsFor(RejectStoreRequestDto, { reason: 'That address is already taken.' })).toEqual(
      [],
    );
  });
});

describe('the emails an application produces', () => {
  const request = {
    businessName: 'Northwind Apparel',
    slug: 'northwind',
    firstName: 'Priya',
    lastName: 'Raman',
    email: 'priya@northwind.example',
    phone: '+91 80 4000 1234',
    businessCategory: 'Fashion',
    message: 'We run four shops.',
  };

  it('announces a new application to the platform inbox', () => {
    expect(APPLICATION_INBOX).toBe('mail2vakash@gmail.com');

    const { html, text, subject } = newApplication(request);
    expect(subject).toBe('Everystore application — Northwind Apparel');
    for (const part of ['Northwind Apparel', 'northwind', 'priya@northwind.example', 'Fashion']) {
      expect(html).toContain(part);
      expect(text).toContain(part);
    }
  });

  /**
   * The one thing none of these may ever carry. The applicant's password is
   * hashed on arrival and the hash is not passed to the templates at all, but
   * the assertion is cheap and the mistake would be expensive.
   */
  it('never carries a password, hashed or otherwise', () => {
    const mails = [
      newApplication(request),
      applicationReceived(request),
      applicationRejected({ ...request, reason: 'Taken.' }),
    ];

    for (const mail of mails) {
      expect(mail.html).not.toMatch(/\$argon2/);
      expect(mail.text).not.toMatch(/\$argon2/);
      expect(mail.html.toLowerCase()).not.toContain('passwordhash');
    }
  });

  it('tells the applicant we have it, and that nothing is reserved yet', () => {
    const { html, text } = applicationReceived(request);
    expect(text).toContain('Northwind Apparel');
    expect(text).toContain('northwind');
    expect(html).toContain('Nothing is reserved until it is approved');
  });

  it('sends a refusal with the reason as written', () => {
    const { html, text } = applicationRejected({
      ...request,
      reason: 'That address is already taken.',
    });
    expect(text).toContain('That address is already taken.');
    expect(html).toContain('That address is already taken.');
  });

  /** A stranger's free text ends up in an inbox as HTML. */
  it('shows markup as words rather than rendering it', () => {
    const { html } = newApplication({
      ...request,
      businessName: '<script>alert(1)</script>',
      message: 'Line one\nLine two <img src=x onerror=alert(1)>',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Line one<br />Line two');
  });
});
