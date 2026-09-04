import { CategoryShowcaseService } from '../src/categories/category-showcase.service';

/**
 * The discount range on a category tile.
 *
 * It is worth its own suite because the tile makes a public promise — "30-70%
 * OFF" on a shop's homepage — and the only thing that keeps that honest is this
 * arithmetic agreeing with what the product cards inside actually show.
 *
 * The service is driven through a stub Prisma rather than a database: what is
 * under test is the aggregation, and the two queries it makes are plain
 * `findMany` calls whose shape is asserted by the typechecker.
 */
type Row = { categoryId: string | null; price: string; compareAtPrice: string | null };

function serviceWith(
  categories: { id: string; name: string; slug: string; imageUrl: string | null }[],
  products: Row[],
) {
  const prisma = {
    db: {
      category: { findMany: async () => categories },
      product: { findMany: async () => products },
    },
  };
  return new CategoryShowcaseService(prisma as never);
}

const category = (id: string, name = id) => ({ id, name, slug: name.toLowerCase(), imageUrl: null });

describe('the discount range on a category tile', () => {
  it('spans the cheapest and deepest reduction in the category', async () => {
    const service = serviceWith([category('c1', 'Ethnic')], [
      { categoryId: 'c1', price: '500.00', compareAtPrice: '1000.00' }, // 50%
      { categoryId: 'c1', price: '200.00', compareAtPrice: '1000.00' }, // 80%
      { categoryId: 'c1', price: '900.00', compareAtPrice: '1000.00' }, // 10%
    ]);

    const [tile] = await service.tiles();
    expect(tile.discount).toEqual({ min: 10, max: 80 });
    expect(tile.productCount).toBe(3);
  });

  /**
   * A single reduced product must not render as "20-20% OFF". The frontend
   * collapses equal bounds, and it can only do that if both are reported.
   */
  it('reports equal bounds when only one product is reduced', async () => {
    const service = serviceWith([category('c1')], [
      { categoryId: 'c1', price: '80.00', compareAtPrice: '100.00' },
      { categoryId: 'c1', price: '50.00', compareAtPrice: null },
    ]);

    const [tile] = await service.tiles();
    expect(tile.discount).toEqual({ min: 20, max: 20 });
  });

  /**
   * Nothing on sale means no claim. The tile shows a product count instead —
   * inventing a discount here is exactly the failure this endpoint exists to
   * prevent.
   */
  it('offers no discount when nothing in the category is reduced', async () => {
    const service = serviceWith([category('c1')], [
      { categoryId: 'c1', price: '100.00', compareAtPrice: null },
      { categoryId: 'c1', price: '100.00', compareAtPrice: '100.00' },
      // A compareAtPrice *below* the price is bad data, not a discount.
      { categoryId: 'c1', price: '100.00', compareAtPrice: '80.00' },
    ]);

    const [tile] = await service.tiles();
    expect(tile.discount).toBeNull();
    expect(tile.productCount).toBe(3);
  });

  /**
   * A zero `compareAtPrice` would divide by zero and put "Infinity% OFF" on the
   * homepage. Seed data and imports both produce zeros.
   */
  it('ignores a zero was-price rather than dividing by it', async () => {
    const service = serviceWith([category('c1')], [
      { categoryId: 'c1', price: '10.00', compareAtPrice: '0.00' },
    ]);

    const [tile] = await service.tiles();
    expect(tile.discount).toBeNull();
  });

  /** A tile leading to an empty grid is a dead end; a row of them looks broken. */
  it('drops categories with no live products', async () => {
    const service = serviceWith(
      [category('c1', 'Full'), category('c2', 'Empty')],
      [{ categoryId: 'c1', price: '10.00', compareAtPrice: null }],
    );

    const tiles = await service.tiles();
    expect(tiles.map((t) => t.name)).toEqual(['Full']);
  });

  it('returns nothing at all when the shop has no categories', async () => {
    expect(await serviceWith([], []).tiles()).toEqual([]);
  });

  it('honours the tile limit', async () => {
    const many = Array.from({ length: 10 }, (_, i) => category(`c${i}`, `Cat${i}`));
    const products = many.map((c) => ({
      categoryId: c.id,
      price: '10.00',
      compareAtPrice: null,
    }));

    expect(await serviceWith(many, products).tiles(6)).toHaveLength(6);
  });

  /**
   * Products are counted against the category they are filed under. A row with
   * no category at all must not be counted against anything.
   */
  it('ignores an uncategorised product', async () => {
    const service = serviceWith([category('c1')], [
      { categoryId: 'c1', price: '10.00', compareAtPrice: null },
      { categoryId: null, price: '10.00', compareAtPrice: '20.00' },
    ]);

    const [tile] = await service.tiles();
    expect(tile.productCount).toBe(1);
    expect(tile.discount).toBeNull();
  });
});
