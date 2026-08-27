import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateThemeDto } from '../src/theme/dto/theme.dto';

/**
 * The three states an optional image field has to keep distinct.
 *
 * `@IsOptional()` skips `null` and `undefined` but *not* an empty string, so a
 * plain `@IsOptional() @IsUrl()` rejects the one value a form uses to say
 * "remove this image" — an admin who cleared a picture and saved was told
 * "backgroundImageUrl must be a URL address" about a field they had
 * deliberately emptied.
 *
 * Validated through the real DTO rather than the decorator in isolation: the
 * bug lived in how the decorators composed, so composing them is the thing
 * worth testing.
 */
const errorsFor = (payload: Record<string, unknown>) =>
  validateSync(plainToInstance(UpdateThemeDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).flatMap((e) => Object.values(e.constraints ?? {}));

const IMAGE_FIELDS = [
  'logoUrl',
  'faviconUrl',
  'backgroundImageUrl',
  'loginImageUrl',
] as const;

describe('optional image URLs on UpdateThemeDto', () => {
  it('accepts an empty string, which is how a form removes an image', () => {
    for (const field of IMAGE_FIELDS) {
      expect(errorsFor({ [field]: '' })).toEqual([]);
    }
  });

  it('accepts an absent field, which means "not editing this"', () => {
    expect(errorsFor({})).toEqual([]);
  });

  it('accepts a real URL', () => {
    for (const field of IMAGE_FIELDS) {
      expect(errorsFor({ [field]: 'https://cdn.example.com/a.png' })).toEqual([]);
    }
  });

  /**
   * Local storage serves uploads from the API's own host, so a development
   * address has no TLD. Rejecting it would make uploads unusable without S3.
   */
  it('accepts a TLD-less development host', () => {
    expect(errorsFor({ logoUrl: 'http://localhost:4000/uploads/a/b.png' })).toEqual([]);
  });

  it('still rejects a value that is not a URL', () => {
    for (const value of ['not a url', 'javascript:alert(1)', 'ftp:/broken', '   ']) {
      expect(errorsFor({ backgroundImageUrl: value }).length).toBeGreaterThan(0);
    }
  });

  /**
   * Whitespace is not emptiness. Accepting `'  '` as "remove" would mean a
   * stray space in a pasted URL silently deleted the image instead of failing.
   */
  it('does not treat whitespace as an empty string', () => {
    expect(errorsFor({ loginImageUrl: ' ' }).length).toBeGreaterThan(0);
  });
});

/**
 * The other half of the contract: the *service* is what turns an accepted empty
 * string into a null column. This pins the DTO's side only — that the value
 * gets through validation at all — which is where the bug was.
 */
describe('the rest of UpdateThemeDto still validates', () => {
  it('rejects a colour that is not hex', () => {
    expect(errorsFor({ primaryColor: 'red' }).length).toBeGreaterThan(0);
  });

  it('rejects a font outside the allowlist', () => {
    expect(errorsFor({ headingFont: 'Comic Sans MS' }).length).toBeGreaterThan(0);
  });

  it('rejects an unknown background preset', () => {
    expect(errorsFor({ background: 'sparkles' }).length).toBeGreaterThan(0);
  });

  it('rejects a login message longer than the column allows', () => {
    expect(errorsFor({ loginMessage: 'x'.repeat(161) }).length).toBeGreaterThan(0);
    expect(errorsFor({ loginMessage: 'x'.repeat(160) })).toEqual([]);
  });
});
