import { applyDecorators } from '@nestjs/common';
import { IsHexColor, IsOptional, ValidateIf } from 'class-validator';

/**
 * A hex colour, an empty string, or absent — the same three states as
 * `IsUrlOrEmpty`, for the same reason.
 *
 *   absent  — not editing this field; leave whatever is stored
 *   ''      — clear it; the service writes null, and the storefront falls back
 *             to the store's brand colour
 *   #RRGGBB — use exactly this
 *
 * Without the `ValidateIf`, clearing a colour would fail validation with "must
 * be a hexadecimal colour" on a field the shopkeeper deliberately emptied.
 */
export function IsHexColourOrEmpty(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    ValidateIf((_object, value) => value !== ''),
    IsHexColor(),
  );
}
