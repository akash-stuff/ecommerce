import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * An optional boolean filter arriving as a query string.
 *
 * Three states have to survive the trip, because a filter that cannot express
 * "don't filter" is not optional:
 *
 *   absent / ''  — undefined; the service leaves the field out of `where`
 *   true         — 'true', '1', true
 *   false        — 'false', '0', false
 *
 * Both hand-rolled versions this replaces got one of those wrong, and neither
 * failure was visible from reading the DTO:
 *
 * `@Type(() => Boolean)` looks like a parser but is just the `Boolean`
 * constructor, and every non-empty string is truthy — so `?featured=false`
 * asked for `isFeatured: true` and returned exactly the rows it was meant to
 * exclude.
 *
 * `@Transform(({ value }) => value === true || value === 'true')` inverts the
 * absent case instead. `tsconfig` targets ES2022, so `useDefineForClassFields`
 * is on and `isPublished?: boolean` compiles to a real class field — an own
 * property, present and `undefined`, on every instance. class-transformer sees
 * the key, runs the transform, and `undefined` becomes `false`. A list guarded
 * by `query.isPublished !== undefined` then filters on a value the client never
 * sent: the admin Pages screen showed drafts only, and a published page could
 * not be found anywhere in the console that created it.
 *
 * Hence `undefined` in, `undefined` out — and an unrecognised value is returned
 * untouched so `@IsBoolean` rejects it with a 400 rather than being quietly
 * read as false.
 */
export function BooleanQuery(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Transform(({ value }) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (value === true || value === 'true' || value === '1') return true;
      if (value === false || value === 'false' || value === '0') return false;
      return value;
    }),
    IsBoolean(),
  );
}
