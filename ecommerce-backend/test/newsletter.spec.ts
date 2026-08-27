import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SubscribeDto, SubscriberQueryDto } from '../src/newsletter/dto/newsletter.dto';
import { newsletterWelcome } from '../src/notifications/templates';
import { csvCell } from '../src/newsletter/newsletter.service';

const OPTIONS = { enableImplicitConversion: false };

function parse(plain: Record<string, unknown>) {
  const dto = plainToInstance(SubscribeDto, plain, OPTIONS);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { email: dto.email, messages: errors.flatMap((e) => Object.values(e.constraints ?? {})) };
}

describe('the address a shopper types in', () => {
  /**
   * The unique index is on (tenantId, email), so anything that reaches it
   * un-normalised becomes a second row for the same person — and then a second
   * copy of every mailing.
   */
  it('is lowercased and trimmed, so one person is one subscriber', () => {
    expect(parse({ email: '  Sam@Example.COM ' }).email).toBe('sam@example.com');
  });

  it('is accepted when it is a real address', () => {
    expect(parse({ email: 'sam@example.com' }).messages).toEqual([]);
  });

  it('is rejected with a sentence a shopper can act on', () => {
    // The panel shows this string verbatim, so it has to read as a message
    // rather than as a field name and a constraint.
    expect(parse({ email: 'not-an-address' }).messages).toEqual([
      'Enter an email address we can reach you at.',
    ]);
  });

  it('is rejected when it is only whitespace', () => {
    expect(parse({ email: '   ' }).messages.length).toBeGreaterThan(0);
  });

  /**
   * `source` records which of our own forms a row came from. A value the client
   * can set is not a record of anything, and `forbidNonWhitelisted` is what
   * turns "ignored" into "refused" so the omission is deliberate rather than
   * silent.
   */
  it('cannot smuggle a source alongside the address', () => {
    expect(parse({ email: 'sam@example.com', source: 'checkout' }).messages.length).toBeGreaterThan(
      0,
    );
  });
});

describe('the admin list filter', () => {
  const read = (plain: Record<string, unknown>) =>
    plainToInstance(SubscriberQueryDto, { page: '1', limit: '25', ...plain }, OPTIONS).subscribed;

  // Three states, as everywhere else: absent means "do not filter". See
  // boolean-query.spec.ts for why this is worth its own assertion.
  it('keeps absent, true and false distinct', () => {
    expect(read({})).toBeUndefined();
    expect(read({ subscribed: 'true' })).toBe(true);
    expect(read({ subscribed: 'false' })).toBe(false);
  });

  it('inherits search from the pagination base rather than redeclaring it', () => {
    const dto = plainToInstance(
      SubscriberQueryDto,
      { page: '1', limit: '25', search: 'sam' },
      OPTIONS,
    );
    expect(dto.search).toBe('sam');
  });
});

describe('the confirmation email', () => {
  const store = { storeName: 'Northwind', storeEmail: 'hi@northwind.test' };

  it('says how to get off the list, in both parts', () => {
    const mail = newsletterWelcome({ ...store, alreadySubscribed: false });
    expect(mail.html).toContain('Reply to this email');
    expect(mail.text).toContain('Reply to this email');
  });

  /**
   * A repeat signup must not read as a fresh one, or someone who has been on
   * the list for a year is told they have just joined.
   */
  it('reads differently for someone already subscribed', () => {
    const fresh = newsletterWelcome({ ...store, alreadySubscribed: false });
    const repeat = newsletterWelcome({ ...store, alreadySubscribed: true });
    expect(repeat.text).toContain('already on the Northwind list');
    expect(fresh.text).not.toContain('already');
  });

  it('escapes a store name, which an owner types in', () => {
    const mail = newsletterWelcome({
      storeName: '<script>alert(1)</script>',
      storeEmail: 'hi@northwind.test',
      alreadySubscribed: false,
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('the CSV export', () => {
  /**
   * Every address in this file was typed into a public form by a stranger, and
   * Excel and Sheets run a cell beginning `=`, `+`, `-` or `@` on open. The
   * shopkeeper opening their own export is the target.
   */
  it.each(['=HYPERLINK("http://evil.test","click")', '+1', '-1+1', '@SUM(A1)'])(
    'defuses %p so a spreadsheet treats it as text',
    (payload) => {
      const cell = csvCell(payload);
      expect(cell.startsWith(`"'`)).toBe(true);
    },
  );

  it('leaves an ordinary address alone apart from quoting', () => {
    expect(csvCell('sam@example.com')).toBe('"sam@example.com"');
  });

  it('doubles quotes rather than letting them end the field', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
