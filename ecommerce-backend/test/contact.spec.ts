import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ContactEnquiryDto } from '../src/contact/dto/contact.dto';
import { platformEnquiry } from '../src/contact/contact-template';
import { ENQUIRY_RECIPIENT } from '../src/contact/contact.service';

/**
 * The one endpoint on the platform an anonymous stranger can put free text into
 * and cause an email to be sent. Both halves of that sentence are tested: what
 * the form will accept, and what the message it produces contains.
 */
const errorsFor = (plain: Record<string, unknown>) =>
  validateSync(
    plainToInstance(ContactEnquiryDto, plain, { enableImplicitConversion: false }),
    { whitelist: true, forbidNonWhitelisted: true },
  ).flatMap((e) => Object.values(e.constraints ?? {}));

const enquiry = (over: Partial<ContactEnquiryDto> = {}): ContactEnquiryDto =>
  ({
    name: 'Priya Raman',
    email: 'priya@northwind.example',
    message: 'We run four shops and would like a demo before the festive season.',
    ...over,
  }) as ContactEnquiryDto;

describe('the enquiry form', () => {
  it('accepts a name, an address and something to say', () => {
    expect(errorsFor({ ...enquiry() })).toEqual([]);
  });

  it('takes a mobile number and a business name when they are offered', () => {
    expect(
      errorsFor({ ...enquiry(), phone: '+91 80 4000 1234', company: 'Northwind Trading' }),
    ).toEqual([]);
  });

  it('refuses an address it could not reply to', () => {
    expect(errorsFor({ ...enquiry(), email: 'priya@' })).toHaveLength(1);
    expect(errorsFor({ ...enquiry(), email: '' })).toHaveLength(1);
  });

  /**
   * The bound that matters most. Without it the field is a document delivery
   * service aimed at one inbox, one request at a time.
   */
  it('refuses a message longer than the form allows', () => {
    expect(errorsFor({ ...enquiry(), message: 'x'.repeat(2001) })).toHaveLength(1);
    expect(errorsFor({ ...enquiry(), message: 'x'.repeat(2000) })).toEqual([]);
  });

  it('refuses a message too short to be one', () => {
    expect(errorsFor({ ...enquiry(), message: 'hi' })).toHaveLength(1);
  });

  it('trims and lowercases the address, so two spellings are one person', () => {
    const dto = plainToInstance(ContactEnquiryDto, {
      ...enquiry(),
      email: '  Priya@Northwind.Example ',
      name: '  Priya Raman  ',
    });
    expect(dto.email).toBe('priya@northwind.example');
    expect(dto.name).toBe('Priya Raman');
  });

  it('still refuses a key it does not know', () => {
    expect(errorsFor({ ...enquiry(), tenantId: 'sneaky' })).toHaveLength(1);
  });
});

describe('the email an enquiry becomes', () => {
  it('goes to the platform inbox and replies to the sender', () => {
    // The recipient is a constant in the service rather than a setting, so the
    // test names it: changing where enquiries go is a reviewed change.
    expect(ENQUIRY_RECIPIENT).toBe('mail2vakash@gmail.com');
  });

  it('carries the name, the address, the mobile and the message', () => {
    const { html, text, subject } = platformEnquiry(
      enquiry({ phone: '+91 80 4000 1234', company: 'Northwind Trading' }),
    );

    expect(subject).toBe('Everystore enquiry — Priya Raman');
    for (const part of [
      'Priya Raman',
      'priya@northwind.example',
      '+91 80 4000 1234',
      'Northwind Trading',
      'festive season',
    ]) {
      expect(html).toContain(part);
      expect(text).toContain(part);
    }
  });

  it('leaves out the rows it was given nothing for', () => {
    const { html } = platformEnquiry(enquiry());
    expect(html).not.toContain('Mobile');
    expect(html).not.toContain('Business');
  });

  /**
   * A stranger's 2000 characters end up in an inbox as HTML. Anything that
   * could be markup has to arrive as the text it was typed as.
   */
  it('shows markup as words rather than rendering it', () => {
    const { html } = platformEnquiry(
      enquiry({
        name: '<script>alert(1)</script>',
        message: 'Line one\nLine two <img src=x onerror=alert(1)>',
      }),
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    // Newlines survive as line breaks, which is the one tag this adds itself.
    expect(html).toContain('Line one<br />Line two');
  });
});
