import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { isPrivateAddress, loadStoreLogo } from '../src/invoices/store-logo';
import { renderInvoicePdf } from '../src/invoices/invoice-pdf';
import type { InvoiceData } from '../src/invoices/invoice-data';

/**
 * Loading a store's logo is the one place the invoice renderer would otherwise
 * make an outbound request to an address held in the database — and a
 * shopkeeper can paste any address into that field, because the upload widget
 * offers a "paste a URL" box.
 *
 * These are the tests for the guards. They matter more than the drawing.
 */
describe('private address detection', () => {
  /**
   * The single most valuable target for this class of bug: every major cloud
   * serves instance credentials from 169.254.169.254 with no authentication.
   */
  it('refuses the cloud metadata address', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
  });

  it('refuses loopback, in both families and in an IPv6 wrapper', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('127.1.2.3')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    // An IPv4 address written inside IPv6 still reaches an IPv4 host.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('refuses every RFC 1918 range', () => {
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.31.255.255')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
  });

  it('refuses carrier-grade NAT and unspecified addresses', () => {
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
  });

  it('refuses IPv6 unique-local and link-local', () => {
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fd12:3456::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
  });

  /**
   * The near-misses. 172.15 and 172.32 sit either side of the private block,
   * and treating them as private would break real CDNs.
   */
  it('permits genuinely public addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('172.15.0.1')).toBe(false);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('192.169.0.1')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});

/** A real PNG, so the magic-byte check is exercised rather than stubbed. */
function png(): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    let c = ~0;
    for (const byte of typed) {
      c ^= byte;
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    crc.writeUInt32BE(~c >>> 0);
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.concat(
    Array.from({ length: 8 }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 0x99)]),
    ),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('loading a store logo', () => {
  const root = mkdtempSync(join(tmpdir(), 'logo-test-'));
  const publicBaseUrl = 'http://localhost:4000';

  beforeAll(() => {
    mkdirSync(join(root, 'tenants', 't1', 'theme'), { recursive: true });
    writeFileSync(join(root, 'tenants', 't1', 'theme', 'mark.png'), png());
    writeFileSync(join(root, 'secret.png'), png());
  });

  const source = (url: string | null | undefined) => ({
    url,
    publicBaseUrl,
    localDir: root,
  });

  it('has nothing to load when no logo is set', async () => {
    await expect(loadStoreLogo(source(null))).resolves.toBeNull();
    await expect(loadStoreLogo(source('   '))).resolves.toBeNull();
    await expect(loadStoreLogo(source('not a url'))).resolves.toBeNull();
  });

  /**
   * The common path, and the one that makes a local install work: our own URL
   * is read off the disk and no request is made at all.
   */
  it('reads our own upload straight from disk', async () => {
    const bytes = await loadStoreLogo(
      source(`${publicBaseUrl}/uploads/tenants/t1/theme/mark.png`),
    );

    expect(bytes).toBeInstanceOf(Buffer);
    expect(bytes!.subarray(1, 4).toString()).toBe('PNG');
  });

  /**
   * The key comes out of the database, not out of the sanitised upload path,
   * so the containment check is made again on the way out.
   */
  it('refuses a key that climbs out of the upload directory', async () => {
    await expect(
      loadStoreLogo(source(`${publicBaseUrl}/uploads/../secret.png`)),
    ).resolves.toBeNull();
    await expect(
      loadStoreLogo(source(`${publicBaseUrl}/uploads/%2e%2e/secret.png`)),
    ).resolves.toBeNull();
  });

  it('does not treat another origin as local, even under /uploads', async () => {
    // Would be a disk read if the origin were not checked; must not be.
    await expect(
      loadStoreLogo(source('http://evil.test/uploads/tenants/t1/theme/mark.png')),
    ).resolves.toBeNull();
  });

  /**
   * An `http` logo elsewhere is a plaintext request this server makes on a
   * schedule somebody else chooses. The one legitimate `http` case is our own
   * upload, which never reaches the network path.
   */
  it('refuses plain http for a remote host', async () => {
    await expect(loadStoreLogo(source('http://cdn.test/logo.png'))).resolves.toBeNull();
  });

  it('refuses a scheme that is not http at all', async () => {
    await expect(loadStoreLogo(source('file:///etc/passwd'))).resolves.toBeNull();
    await expect(loadStoreLogo(source('data:image/png;base64,AAAA'))).resolves.toBeNull();
  });

  /** Loopback and the metadata address, reached by literal IP. */
  it('refuses a remote host that is really a private address', async () => {
    await expect(loadStoreLogo(source('https://127.0.0.1/logo.png'))).resolves.toBeNull();
    await expect(
      loadStoreLogo(source('https://169.254.169.254/latest/meta-data/')),
    ).resolves.toBeNull();
    await expect(loadStoreLogo(source('https://10.0.0.5/logo.png'))).resolves.toBeNull();
  });

  /**
   * pdfkit embeds PNG and JPEG only. Anything else would reach the renderer and
   * throw in the middle of a document somebody is trying to download.
   */
  it('refuses a local file that is not an embeddable image', async () => {
    writeFileSync(join(root, 'notes.txt'), 'plain text, not a picture');

    await expect(
      loadStoreLogo(source(`${publicBaseUrl}/uploads/notes.txt`)),
    ).resolves.toBeNull();
  });

  it('is null rather than throwing when the file is simply missing', async () => {
    await expect(
      loadStoreLogo(source(`${publicBaseUrl}/uploads/nothing-here.png`)),
    ).resolves.toBeNull();
  });
});

describe('the invoice with a brand', () => {
  const base: InvoiceData = {
    invoiceNumber: 'INV-1',
    orderNumber: 'ORD-1',
    issuedAt: new Date('2026-08-21T10:00:00Z'),
    placedAt: new Date('2026-08-21T10:00:00Z'),
    currency: 'INR',
    isPaid: true,
    paymentMethod: 'Cash on delivery',
    seller: { name: 'Northwind', lines: ['14 Residency Road'], state: 'Karnataka' },
    billTo: { name: 'Priya', lines: ['22 Alwarpet Street'], state: 'Tamil Nadu' },
    shipTo: { name: 'Priya', lines: ['22 Alwarpet Street'], state: 'Tamil Nadu' },
    lines: [
      {
        description: 'Mug',
        meta: 'SKU MUG-1',
        quantity: 1,
        unitPrice: '100.00',
        discount: '0.00',
        tax: '18.00',
        lineTotal: '118.00',
      },
    ],
    subtotal: '100.00',
    discountTotal: '0.00',
    taxLines: [{ label: 'IGST', amount: '18.00' }],
    taxTotal: '18.00',
    shippingTotal: '0.00',
    grandTotal: '118.00',
  };

  it('embeds the logo when there is one', async () => {
    const withLogo = await renderInvoicePdf({
      ...base,
      brand: { primary: '#166534', secondary: '#F5A524', logo: png() },
    });
    const without = await renderInvoicePdf({
      ...base,
      brand: { primary: '#166534', secondary: '#F5A524', logo: null },
    });

    expect(withLogo.subarray(0, 5).toString()).toBe('%PDF-');
    /**
     * `/Subtype /Image`, not `/Image`: pdfkit writes `/ProcSet [… /ImageB
     * /ImageC /ImageI]` into every document whether or not one is embedded, so
     * the looser marker matches even an invoice with no logo on it.
     */
    expect(withLogo.toString('latin1')).toContain('/Subtype /Image');
    expect(without.toString('latin1')).not.toContain('/Subtype /Image');
  });

  /**
   * A stored colour never passed through the API's validation — a seed, a
   * migration, a hand edit. It must not be able to reach the drawing code.
   */
  it('survives a brand colour that is not a colour', async () => {
    const pdf = await renderInvoicePdf({
      ...base,
      brand: {
        primary: 'red;background-image:url(https://evil/px)',
        secondary: 'nonsense',
        logo: null,
      },
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  /** An invoice must not fail because a logo turned out to be rubbish. */
  it('still renders when the logo bytes are unusable', async () => {
    const pdf = await renderInvoicePdf({
      ...base,
      brand: {
        primary: '#166534',
        secondary: '#F5A524',
        logo: Buffer.from('not really a png'),
      },
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders with no brand at all, on the platform defaults', async () => {
    const pdf = await renderInvoicePdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
