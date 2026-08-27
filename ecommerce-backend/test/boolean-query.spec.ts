import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PageQueryDto } from '../src/pages/dto/page.dto';
import { CustomerQueryDto } from '../src/customers/dto/customer.dto';
import { ProductQueryDto } from '../src/products/dto/product.dto';
import { CategoryQueryDto } from '../src/categories/dto/category.dto';
import { CouponQueryDto } from '../src/coupons/dto/coupon.dto';
import { CartViewQueryDto } from '../src/carts/dto/cart.dto';

/**
 * Boolean filters arriving as query strings.
 *
 * Everything here is driven through the real DTOs with the same transform
 * options `main.ts` gives the global pipe, because all three bugs this pins
 * down lived in how the decorators composed rather than in any logic of ours.
 */
const OPTIONS = { enableImplicitConversion: false };

function parse<T>(cls: new () => T, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain, OPTIONS);
  const errors = validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, rejected: errors.length > 0 };
}

/** Every optional boolean filter on a paginated list, and the DTO it lives on. */
const FILTERS: Array<[string, string, new () => object]> = [
  ['pages', 'isPublished', PageQueryDto],
  ['customers', 'hasOrdered', CustomerQueryDto],
  ['products', 'inStock', ProductQueryDto],
  ['products', 'featured', ProductQueryDto],
  ['categories', 'rootOnly', CategoryQueryDto],
  ['categories', 'isActive', CategoryQueryDto],
  ['coupons', 'isActive', CouponQueryDto],
];

describe.each(FILTERS)('%s?%s', (_list, field, cls) => {
  const read = (plain: Record<string, unknown>) => {
    const { dto, rejected } = parse(cls, { page: '1', limit: '20', ...plain });
    return { value: (dto as Record<string, unknown>)[field], rejected };
  };

  /**
   * The case that broke the admin Pages screen.
   *
   * `tsconfig` targets ES2022, so `useDefineForClassFields` is on and every
   * declared field becomes an own property of the instance — present, and
   * `undefined`. A transform of the shape `value === 'true'` then turns "the
   * client sent nothing" into `false`, and a service guarded by
   * `!== undefined` filters on it. Both shapes are checked because ts-jest does
   * not compile class fields the way `nest build` does, so testing only the
   * absent key would have let the original bug through green.
   */
  it('is undefined when the client sends nothing', () => {
    expect(read({}).value).toBeUndefined();
    expect(read({ [field]: undefined }).value).toBeUndefined();
  });

  it('is undefined for an empty value, which is how a cleared <select> arrives', () => {
    expect(read({ [field]: '' }).value).toBeUndefined();
  });

  it("reads 'true' as true", () => {
    expect(read({ [field]: 'true' })).toEqual({ value: true, rejected: false });
  });

  /**
   * `@Type(() => Boolean)` is the `Boolean` constructor, not a parser, and every
   * non-empty string is truthy — so `?featured=false` used to ask for
   * `isFeatured: true` and return precisely the rows it was meant to exclude.
   */
  it("reads 'false' as false, not as true", () => {
    expect(read({ [field]: 'false' })).toEqual({ value: false, rejected: false });
  });

  it('rejects a value that is neither, rather than reading it as false', () => {
    expect(read({ [field]: 'yes' }).rejected).toBe(true);
  });
});

describe('the cart total', () => {
  it('treats an absent cod flag as "no fee" without inventing a value', () => {
    // Read as `query.cod === true` at the controller, so undefined is correct
    // here; the point is that it stays optional rather than being coerced.
    expect(parse(CartViewQueryDto, {}).dto.cod).toBeUndefined();
    expect(parse(CartViewQueryDto, { cod: 'true' }).dto.cod).toBe(true);
  });
});
