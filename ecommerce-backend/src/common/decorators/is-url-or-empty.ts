import { applyDecorators } from '@nestjs/common';
import { IsOptional, IsUrl, ValidateIf } from 'class-validator';

/**
 * A URL, an empty string, or absent — three states that mean three things.
 *
 * `@IsOptional()` alone is not enough, and the gap is easy to miss. It skips
 * validation for `null` and `undefined` only, so an empty string still reaches
 * `@IsUrl` and is rejected with "must be a URL address". That matters because
 * an empty string is exactly how a form says *remove this image*: an admin who
 * clears the picture and saves gets a validation error naming a field they
 * deliberately emptied.
 *
 * The three states have to stay distinct:
 *
 *   absent  — not editing this field; leave whatever is stored
 *   ''      — remove it; the service writes null
 *   a URL   — set it
 *
 * Collapsing "" into "absent" would make removal impossible, which is the bug
 * this decorator exists to prevent rather than to work around.
 *
 * `require_tld: false` so a development host — `http://localhost:4000/uploads/…`
 * — is accepted alongside a real CDN address.
 */
export function IsUrlOrEmpty(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    // Runs before IsUrl and short-circuits it for the clearing case.
    ValidateIf((_object, value) => value !== ''),
    IsUrl({ require_tld: false }),
  );
}
