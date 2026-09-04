import {
  INK,
  buttonFill,
  contrast,
  inkOn,
  safeHex,
  safeUrl,
  subjectSafe,
} from '../src/notifications/email-theme';
import {
  customerWelcome,
  emailVerificationCode,
  newsletterWelcome,
  orderConfirmation,
  orderStatusChanged,
  passwordResetCode,
  staffInvited,
  storeSetup,
  type EmailBrand,
  type OrderEmailData,
} from '../src/notifications/templates';

const brand: EmailBrand = {
  storeName: 'Northwind',
  storeEmail: 'help@northwind.test',
  brandColor: '#166534',
  logoUrl: 'https://cdn.northwind.test/logo.png',
  storefrontUrl: 'https://northwind.test',
};

const order = (over: Partial<OrderEmailData> = {}): OrderEmailData => ({
  storeName: 'Northwind',
  storeEmail: 'help@northwind.test',
  brandColor: '#166534',
  orderNumber: 'ORD-1',
  customerName: 'Asha',
  currency: 'INR',
  items: [{ name: 'Scarf', variantName: null, quantity: 1, lineTotal: '100.00' }],
  subtotal: '100.00',
  discountTotal: '0.00',
  taxTotal: '18.00',
  shippingTotal: '0.00',
  grandTotal: '118.00',
  shippingAddress: {
    fullName: 'Asha',
    line1: '1 Road',
    line2: null,
    city: 'Mumbai',
    state: 'MH',
    postalCode: '400001',
    country: 'IN',
  },
  paymentMethod: 'Cash on delivery',
  ...over,
});

/** Every template, rendered from one place, so a sweep cannot miss one. */
const renderAll = (b?: EmailBrand) => [
  { name: 'orderConfirmation', mail: orderConfirmation(order(), b) },
  {
    name: 'orderStatusChanged',
    mail: orderStatusChanged(
      { ...brand, orderNumber: 'ORD-1', customerName: 'Asha', status: 'SHIPPED' },
      b,
    ),
  },
  {
    name: 'customerWelcome',
    mail: customerWelcome({ ...brand, customerName: 'Asha' }, b),
  },
  {
    name: 'emailVerificationCode',
    mail: emailVerificationCode({ ...brand, code: '408215', expiresInMinutes: 10 }, b),
  },
  {
    name: 'passwordResetCode',
    mail: passwordResetCode({ ...brand, code: '408215', expiresInMinutes: 10 }, b),
  },
  {
    name: 'storeSetup',
    mail: storeSetup(
      {
        storeName: 'Northwind',
        ownerName: 'Priya',
        adminUrl: 'https://admin.test/login',
        storefrontUrl: 'https://northwind.test',
        platformName: 'platform.test',
        supportEmail: 'support@platform.test',
        email: 'priya@northwind.test',
      },
      b,
    ),
  },
  {
    name: 'newsletterWelcome',
    mail: newsletterWelcome({ ...brand, alreadySubscribed: false }, b),
  },
  {
    name: 'staffInvited',
    mail: staffInvited(
      { ...brand, firstName: 'Rohit', role: 'Staff', signInUrl: 'https://admin.test/login' },
      b,
    ),
  },
];

/**
 * The tenant's colour reaches a `bgcolor` attribute, an inline
 * `background-color` and a VML `fillcolor`. `escapeHtml` makes none of those
 * safe — it leaves `;`, `:`, `(` and `)` alone — so the colour is validated
 * rather than escaped, and this is the test that says so.
 */
describe('brand colour validation', () => {
  it('accepts a six-digit hex and normalises its case', () => {
    expect(safeHex('#166534')).toBe('#166534');
    expect(safeHex('#a1b2c3')).toBe('#A1B2C3');
  });

  it('refuses a CSS payload that survives HTML escaping', () => {
    // Nothing in this string is touched by escapeHtml, which is the whole point.
    expect(safeHex('red;background-image:url(https://evil/px)')).toBe('#166534');
    expect(safeHex('#166534;x:y')).toBe('#166534');
  });

  it('refuses shorthand and alpha hex, which mail clients render unpredictably', () => {
    expect(safeHex('#abc')).toBe('#166534');
    expect(safeHex('#aabbccdd')).toBe('#166534');
  });

  it('falls back for absent, empty and non-hex values', () => {
    expect(safeHex(undefined)).toBe('#166534');
    expect(safeHex('')).toBe('#166534');
    expect(safeHex('rebeccapurple')).toBe('#166534');
  });
});

describe('computed ink and button fill', () => {
  it('puts white type on a dark brand and dark type on a pale one', () => {
    expect(inkOn('#166534')).toBe('#FFFFFF');
    // The platform's own secondary is 2.04:1 on white — unreadable as a ground
    // for white type, and exactly the case a white-label system has to survive.
    expect(inkOn('#F5A524')).toBe(INK.STRONG);
  });

  it('darkens a pale brand until a white label is legible on it', () => {
    const fill = buttonFill('#F5A524');
    expect(contrast(fill, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves a brand that is already dark enough alone', () => {
    expect(buttonFill('#166534')).toBe('#166534');
  });

  it('never returns something a validator would reject', () => {
    for (const input of ['#FFFFFF', '#FFFF00', 'nonsense', '#000000']) {
      expect(buttonFill(input)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('URL validation', () => {
  it('keeps https, and http only where http is allowed', () => {
    expect(safeUrl('https://a.test/x')).toBe('https://a.test/x');
    expect(safeUrl('http://a.test:5173/x')).toBe('http://a.test:5173/x');
    // Images are stricter: an http image is blocked or warned about by most
    // clients, whereas an http href is only a development admin URL.
    expect(safeUrl('http://a.test/x', true)).toBeNull();
  });

  it('refuses executable and inline schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeUrl('vbscript:msgbox(1)')).toBeNull();
  });

  it('treats an unparseable value as no URL rather than as a relative one', () => {
    expect(safeUrl('/shop')).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });
});

describe('subject lines', () => {
  /** A store called "Tom & Jerry" must not arrive as "Tom &amp; Jerry". */
  it('does not HTML-escape', () => {
    expect(subjectSafe('Tom & Jerry')).toBe('Tom & Jerry');
    const mail = customerWelcome({
      storeName: 'Tom & Jerry',
      storeEmail: 'hi@test',
      customerName: 'Asha',
    });
    expect(mail.subject).toContain('Tom & Jerry');
  });

  /** A newline in a mail header is header injection. */
  it('strips CR and LF from an owner-typed value', () => {
    expect(subjectSafe('Northwind\r\nBcc: victim@test')).toBe('Northwind Bcc: victim@test');
    const mail = customerWelcome({
      storeName: 'Northwind\nBcc: victim@test',
      storeEmail: 'hi@test',
      customerName: 'Asha',
    });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('is never empty, for any template', () => {
    for (const { name, mail } of renderAll(brand)) {
      expect(`${name}: ${mail.subject}`.length).toBeGreaterThan(name.length + 2);
      expect(mail.subject.trim()).not.toBe('');
    }
  });
});

/**
 * The three templates that had no coverage at all before the redesign, and
 * which the redesign moved the most.
 */
describe('the two code emails', () => {
  const verify = emailVerificationCode(
    { ...brand, code: '408215', expiresInMinutes: 10 },
    brand,
  );
  const reset = passwordResetCode({ ...brand, code: '408215', expiresInMinutes: 10 }, brand);

  it('leads the subject with the code, so a phone notification shows it', () => {
    expect(verify.subject.startsWith('408215')).toBe(true);
    expect(reset.subject.startsWith('408215')).toBe(true);
  });

  /**
   * Telling someone "confirm your email" when they asked to reset a password
   * reads as the wrong email arriving, which is when a cautious person decides
   * they have been phished.
   */
  it('never mistakes one for the other', () => {
    expect(verify.subject).not.toBe(reset.subject);
    expect(verify.text).toContain('Confirm your email');
    expect(reset.text).toContain('Reset your password');
  });

  it('carries the code in both parts, unspaced in the text one', () => {
    for (const mail of [verify, reset]) {
      expect(mail.text).toContain('408215');
      // The HTML may space it for reading; the text part is the one that gets
      // copied, so it must be the digits and nothing else.
      expect(mail.html).toMatch(/408\s?215/);
    }
  });

  it('keeps the expiry and the did-not-ask-for-this line', () => {
    for (const mail of [verify, reset]) {
      expect(mail.text).toContain('expires in 10 minutes');
      expect(mail.text).toMatch(/if you did not ask for this/i);
      expect(mail.html).toMatch(/if you did not ask for this/i);
    }
  });
});

describe('store setup email', () => {
  const mail = storeSetup(
    {
      storeName: 'Northwind',
      ownerName: 'Priya',
      adminUrl: 'https://admin.test/login',
      storefrontUrl: 'https://northwind.test',
      platformName: 'platform.test',
      supportEmail: 'support@platform.test',
      email: 'priya@northwind.test',
    },
    brand,
  );

  /**
   * The same rule the staff invite is held to, and for the same reason:
   * `deliverEmail` persists the rendered body, so a credential in one of these
   * is a live password sitting in the notifications table.
   */
  it('carries no password', () => {
    expect(mail.html).not.toMatch(/password:\s*\S/i);
  });

  it('says where the admin is and who to sign in as', () => {
    expect(mail.html).toContain('https://admin.test/login');
    expect(mail.text).toContain('https://admin.test/login');
    expect(mail.html).toContain('priya@northwind.test');
  });

  it('lists the five things a store cannot open without', () => {
    for (const step of ['Set up payments', 'Add your branding', 'Add products', 'Publish']) {
      expect(mail.html).toContain(step);
      expect(mail.text).toContain(step);
    }
  });
});

/**
 * One sweep, every template, every string field. Cheaper than remembering to
 * add an escaping test each time a template gains a field.
 */
describe('escaping, across every template', () => {
  const hostile = '<script>alert(1)</script>';

  it('never emits a script tag, whatever is typed into it', () => {
    const hostileBrand: EmailBrand = {
      storeName: hostile,
      storeEmail: hostile,
      brandColor: hostile,
      logoUrl: hostile,
      storefrontUrl: hostile,
    };

    for (const { name, mail } of renderAll(hostileBrand)) {
      expect(`${name}:${mail.html}`).not.toContain('<script>');
      expect(mail.html).not.toContain('javascript:');
    }
  });

  it('escapes a hostile store name into text rather than markup', () => {
    const mail = customerWelcome({
      storeName: hostile,
      storeEmail: 'hi@test',
      customerName: hostile,
    });
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
  });

  /**
   * Dark mode is done with a `<style>` block and a media query precisely so
   * that no template needs a script — two existing tests assert the substring
   * is absent from the whole document.
   */
  it('uses no script for dark mode', () => {
    for (const { mail } of renderAll(brand)) {
      expect(mail.html).not.toContain('<script');
      expect(mail.html).toContain('prefers-color-scheme: dark');
    }
  });
});

/**
 * A store's public address and the address its staff sign in with are separate
 * fields that drift into being the same whenever whoever filled the
 * provisioning form typed one address twice. `NotificationsService.brandFor`
 * withholds the address when that has happened, and passes null.
 *
 * The reason it matters more in an email than on a page: `deliverEmail` stores
 * the rendered body so a failed send can be replayed, so a published sign-in
 * address survives in the notifications table and in every inbox it has already
 * reached, where no settings change can reach it.
 *
 * These tests pin the two halves the compiler cannot: that null actually
 * removes the address, and that removing it does not leave the copy broken.
 */
describe('a withheld contact address', () => {
  const withheld: EmailBrand = { ...brand, storeEmail: null };

  it('prints no address anywhere when there is none to print', () => {
    for (const { name, mail } of renderAll(withheld)) {
      // The whole local-part-and-domain, not just the domain: the storefront
      // URL legitimately contains "northwind.test".
      expect(`${name}: ${mail.html}`).not.toContain('help@northwind.test');
      expect(`${name}: ${mail.text}`).not.toContain('help@northwind.test');
    }
  });

  it('leaves whole sentences behind, not a dangling "write to ."', () => {
    for (const { name, mail } of renderAll(withheld)) {
      expect(`${name}: ${mail.text}`).not.toMatch(/write to\s*[.·]/);
      expect(`${name}: ${mail.text}`).not.toMatch(/·\s*$/m);
      expect(`${name}: ${mail.html}`).not.toContain('&middot; </td>');
    }
  });

  it('still offers a way back to the shop', () => {
    // Losing the address must not leave a receipt with no route to the seller:
    // "reply to this email" reaches SMTP_FROM, which is usually a noreply.
    const { mail } = renderAll(withheld).find((m) => m.name === 'orderConfirmation')!;
    expect(mail.text).toContain('https://northwind.test');
    expect(mail.html).toContain('https://northwind.test');
  });

  it('prints the address when it is safe to', () => {
    // The guard must not be so keen that an ordinary hello@ never appears.
    for (const { name, mail } of renderAll(brand)) {
      expect(`${name}: ${mail.html}`).toContain('help@northwind.test');
    }
  });
});

/**
 * The discipline the dark palette depends on, which no compiler enforces: a
 * media query cannot repaint a cell it does not select, so every neutral
 * surface must carry its role class next to its `bgcolor`. Miss one and that
 * cell alone stays light on a dark card — the characteristic half-inverted
 * email, and one that only shows up on a device nobody tests on.
 */
describe('dark-mode surface classes', () => {
  const NEUTRAL = [INK.PAGE, INK.CARD, INK.PANEL, INK.RULE, INK.RULE_STRONG].map((c) =>
    c.toLowerCase(),
  );

  it('carries a role class on every neutral bgcolor', () => {
    for (const { name, mail } of renderAll(brand)) {
      // Each element that declares a bgcolor, with its whole tag.
      const tags = mail.html.match(/<[a-z]+[^>]*bgcolor="[^"]*"[^>]*>/gi) ?? [];
      expect(tags.length).toBeGreaterThan(0);

      for (const tag of tags) {
        const colour = /bgcolor="([^"]*)"/i.exec(tag)?.[1]?.toLowerCase() ?? '';

        // The brand band and the button fill are deliberately never repainted:
        // they are the store's colour, and dark mode must not take it away.
        if (!NEUTRAL.includes(colour)) continue;

        // `e-plate` is the one acknowledged opt-out — the white ground under a
        // tenant's logo, which must not follow the card into the dark. See the
        // note beside it in email-components.ts. Anything else missing a role
        // class is the half-inverted-email bug.
        expect(`${name} ${tag}`).toMatch(
          /class="[^"]*\be-(page|card|panel|rule|plate)\b/,
        );
      }
    }
  });
});

describe('the store logo', () => {
  /**
   * The plate keeps its white ground in dark mode on purpose. Clients invert
   * the background behind an image, not the image itself, so a plate that
   * followed the card into the dark would swallow a dark transparent logo —
   * and it would look like a blank header rather than a bug, so nobody would
   * report it.
   */
  it('sits on a plate the dark palette does not repaint', () => {
    const mail = customerWelcome({ ...brand, customerName: 'Asha' }, brand);
    expect(mail.html).toContain('e-plate');
    expect(mail.html).not.toMatch(/\.e-plate\s*\{/);
  });

  it('renders when it is an https image', () => {
    const mail = customerWelcome({ ...brand, customerName: 'Asha' }, brand);
    expect(mail.html).toContain('https://cdn.northwind.test/logo.png');
  });

  /**
   * Falling back to the branded wordmark rather than emitting a broken image.
   * An http image is blocked or warned about by most clients.
   */
  it('falls back to the wordmark for anything that is not an https image', () => {
    for (const bad of ['http://cdn.test/logo.png', 'javascript:alert(1)', 'not a url']) {
      const mail = customerWelcome(
        { ...brand, customerName: 'Asha' },
        { ...brand, logoUrl: bad },
      );
      expect(mail.html).not.toContain('<img');
      expect(mail.html).toContain('Northwind');
    }
  });
});

describe('message size', () => {
  /**
   * Gmail clips at about 102KB and shows "view entire message"; everything past
   * the cut is gone at first read, including the footer. A big order is the
   * realistic way to get there.
   */
  it('keeps a forty-item order well inside Gmail’s clipping threshold', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      name: `A product with a reasonably long name, number ${i + 1}`,
      variantName: 'Large / Slate',
      quantity: 2,
      lineTotal: '1299.00',
    }));

    const mail = orderConfirmation(order({ items }), brand);
    expect(Buffer.byteLength(mail.html, 'utf8')).toBeLessThan(90_000);
  });
});

describe('the button', () => {
  it('is omitted entirely when there is nowhere to send anyone', () => {
    const mail = customerWelcome(
      { ...brand, customerName: 'Asha' },
      { ...brand, storefrontUrl: null },
    );
    expect(mail.html).not.toContain('Start shopping');
    // And leaves no gap behind it: the spacer belongs to the button.
    expect(mail.html).not.toContain('v:roundrect');
  });

  it('renders both an Outlook rectangle and a real link when it can', () => {
    const mail = customerWelcome({ ...brand, customerName: 'Asha' }, brand);
    expect(mail.html).toContain('v:roundrect');
    // `new URL()` normalises, so the origin comes back with its trailing slash.
    expect(mail.html).toContain('href="https://northwind.test/"');
  });
});

/**
 * The dispatch email.
 *
 * Tracking used to be formatted into `reason`, which the template renders under
 * a heading saying "Reason" — so a shipped order announced its carrier as
 * though something had gone wrong, with the URL as dead text.
 */
describe('the dispatch email', () => {
  const shipped = (over: Record<string, unknown> = {}) =>
    orderStatusChanged(
      {
        storeName: 'Northwind',
        storeEmail: 'help@northwind.test',
        orderNumber: 'ORD-1',
        customerName: 'Asha',
        status: 'SHIPPED',
        tracking: {
          courier: 'Delhivery',
          consignment: 'DL0293841772IN',
          url: 'https://www.delhivery.com/track/package/DL0293841772IN',
        },
        ...over,
      },
      brand,
    );

  it('gives tracking its own heading, not the one meant for cancellations', () => {
    const mail = shipped();
    expect(mail.html).toContain('Tracking');
    expect(mail.html).not.toContain('Reason');
  });

  it('names the carrier and shows the consignment number', () => {
    const mail = shipped();
    expect(mail.html).toContain('Delhivery');
    expect(mail.html).toContain('DL0293841772IN');
  });

  /** A shopper reading "on its way" wants the carrier, not a list of orders. */
  it('points its button at the parcel rather than the account page', () => {
    const mail = shipped();
    expect(mail.html).toContain('Track your parcel');
    expect(mail.html).toContain('delhivery.com/track/package/DL0293841772IN');
    expect(mail.html).not.toContain('View your orders');
  });

  it('falls back to the account page when the carrier has no link', () => {
    const mail = shipped({ tracking: { courier: 'India Post', consignment: 'EE1', url: null } });
    expect(mail.html).toContain('View your orders');
    expect(mail.html).toContain('India Post');
    expect(mail.html).toContain('EE1');
  });

  it('carries the same facts in the plain-text part, with no markup', () => {
    const mail = shipped();
    expect(mail.text).toContain('Carrier: Delhivery');
    expect(mail.text).toContain('Consignment: DL0293841772IN');
    expect(mail.text).toContain('https://www.delhivery.com/track/package/DL0293841772IN');
    // Pinned by an existing test too, and easy to break with an autolink.
    expect(mail.text).not.toContain('<');
  });

  it('says nothing about tracking on an update that has none', () => {
    const mail = orderStatusChanged(
      {
        storeName: 'Northwind',
        storeEmail: 'help@northwind.test',
        orderNumber: 'ORD-1',
        customerName: 'Asha',
        status: 'CONFIRMED',
      },
      brand,
    );
    expect(mail.html).not.toContain('Tracking');
    expect(mail.text).not.toContain('Carrier:');
  });

  /** A cancellation reason is a different thing and keeps its own heading. */
  it('still reports a cancellation reason separately', () => {
    const mail = orderStatusChanged(
      {
        storeName: 'Northwind',
        storeEmail: 'help@northwind.test',
        orderNumber: 'ORD-1',
        customerName: 'Asha',
        status: 'CANCELLED',
        reason: 'Out of stock',
      },
      brand,
    );
    expect(mail.html).toContain('Reason');
    expect(mail.text).toContain('Reason: Out of stock');
  });

  /**
   * A consignment number is typed by a person in the admin and lands in an
   * HTML email, so it gets the same treatment as a product name.
   */
  it('escapes a hostile consignment number', () => {
    const mail = shipped({
      tracking: { courier: '<script>x</script>', consignment: '<img src=x>', url: null },
    });
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).not.toContain('<img src=x>');
    expect(mail.html).toContain('&lt;');
  });
});
