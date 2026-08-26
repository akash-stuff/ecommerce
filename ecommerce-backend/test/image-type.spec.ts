import { detectImageType } from '../src/media/image-type';
import { encodeKey } from '../src/media/providers/s3.provider';

const withHeader = (bytes: number[], padding = 32): Buffer =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(padding)]);

const JPEG = withHeader([0xff, 0xd8, 0xff, 0xe0]);
const PNG = withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = withHeader([...Buffer.from('GIF89a')]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(16),
]);

/**
 * The uploaded `Content-Type` and filename are both chosen by the uploader, so
 * only the bytes decide what a file is. Serving an HTML document from the
 * store's own origin because it was named `.png` is stored XSS.
 */
describe('image type detection', () => {
  it('recognises the formats the platform serves', () => {
    expect(detectImageType(JPEG)).toEqual({ extension: 'jpg', contentType: 'image/jpeg' });
    expect(detectImageType(PNG)).toEqual({ extension: 'png', contentType: 'image/png' });
    expect(detectImageType(GIF)).toEqual({ extension: 'gif', contentType: 'image/gif' });
    expect(detectImageType(WEBP)).toEqual({ extension: 'webp', contentType: 'image/webp' });
  });

  it('rejects HTML, whatever it claims to be', () => {
    expect(detectImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
  });

  /**
   * SVG is XML that can carry script and event handlers. It is excluded on
   * purpose rather than missed, so this asserts the exclusion holds.
   */
  it('rejects SVG', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('rejects an executable and an archive', () => {
    expect(detectImageType(withHeader([0x4d, 0x5a]))).toBeNull(); // MZ, a Windows PE
    expect(detectImageType(withHeader([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // PK, a zip
  });

  /** "RIFF" alone is also WAV; the WEBP fourcc at byte 8 is what distinguishes it. */
  it('does not mistake another RIFF container for WEBP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WAVE'),
      Buffer.alloc(16),
    ]);
    expect(detectImageType(wav)).toBeNull();
  });

  it('rejects an empty or truncated file rather than throwing', () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

/**
 * SigV4 signs the encoded path. If the path sent differs from the path signed
 * by even one character, S3 answers 403 — which reads as a credentials problem
 * and is not one.
 */
describe('S3 key encoding', () => {
  it('leaves the separators alone', () => {
    expect(encodeKey('tenants/abc/product/2026-08/id.jpg')).toBe(
      'tenants/abc/product/2026-08/id.jpg',
    );
  });

  it('encodes characters that would otherwise change the path', () => {
    expect(encodeKey('a b.jpg')).toBe('a%20b.jpg');
    expect(encodeKey('a+b.jpg')).toBe('a%2Bb.jpg');
  });

  it('encodes the sub-delimiters encodeURIComponent leaves alone', () => {
    expect(encodeKey("!'()*")).toBe('%21%27%28%29%2A');
  });
});
