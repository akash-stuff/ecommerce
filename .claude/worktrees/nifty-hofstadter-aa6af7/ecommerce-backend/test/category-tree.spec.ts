import { buildTree, type CategoryRow } from '../src/categories/categories.service';

const row = (id: string, parentId: string | null, name = id): CategoryRow => ({
  id,
  parentId,
  name,
  slug: name.toLowerCase(),
  imageUrl: null,
  position: 0,
  isActive: true,
});

describe('category tree assembly', () => {
  it('nests children under their parent', () => {
    const tree = buildTree([row('a', null), row('b', 'a'), row('c', 'a')]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children.map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('handles more than one level', () => {
    const tree = buildTree([row('a', null), row('b', 'a'), row('c', 'b')]);

    expect(tree[0].children[0].children[0].id).toBe('c');
  });

  /**
   * A child whose parent was filtered out of the query — an inactive parent, for
   * instance — is surfaced as a root rather than dropped. A category the
   * storefront cannot reach at all is harder to notice than one in the wrong
   * place, and silently vanishing rows is the worse failure.
   */
  it('promotes an orphan to a root instead of dropping it', () => {
    const tree = buildTree([row('b', 'missing-parent')]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('b');
  });

  it('returns every row exactly once', () => {
    const rows = [row('a', null), row('b', 'a'), row('c', 'b'), row('d', null)];
    const tree = buildTree(rows);

    const seen: string[] = [];
    const walk = (nodes: typeof tree) => {
      for (const n of nodes) {
        seen.push(n.id);
        walk(n.children);
      }
    };
    walk(tree);

    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('copes with an empty catalogue', () => {
    expect(buildTree([])).toEqual([]);
  });
});
