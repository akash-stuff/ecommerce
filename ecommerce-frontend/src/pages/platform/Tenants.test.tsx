import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/render';
import Tenants from './Tenants';

/**
 * The row actions are icons with no visible text.
 *
 * Which makes their accessible names the whole of what a screen reader, a
 * hover tooltip and this test have to go on. They are also the most dangerous
 * controls in the product — one of them deletes a shop — so the names have to
 * say *which* shop as well as what the button does. Nothing about that is
 * visible in the rendered page, so it is pinned here.
 */
const tenants = vi.fn();

vi.mock('@/services/platform.service', () => ({
  platformService: {
    tenants: (...a: unknown[]) => tenants(...a),
    plans: () => Promise.resolve([]),
    templateGallery: () => Promise.resolve([]),
    createTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    suspendTenant: vi.fn(),
    activateTenant: vi.fn(),
    resetOwnerPassword: vi.fn(),
    addStoreAdmin: vi.fn(),
  },
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  slug: 'northwind',
  businessName: 'Northwind',
  contactEmail: 'hello@northwind.example',
  contactPhone: null,
  status: 'ACTIVE',
  businessCategory: null,
  suspendedAt: null,
  suspensionReason: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  store: { name: 'Northwind', isPublished: true },
  _count: { orders: 0 },
  ...over,
});

describe('the store row actions', () => {
  beforeEach(() => {
    tenants.mockReset();
    tenants.mockResolvedValue({
      items: [row(), row({ id: 'b2', slug: 'voltway', businessName: 'Voltway', status: 'SUSPENDED' })],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false },
    });
  });

  it('names the store in every action, not just the verb', async () => {
    render(<Tenants />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Northwind' })).toBeInTheDocument());

    for (const name of [
      'Edit Northwind',
      'Suspend Northwind',
      'Add an admin to Northwind',
      'Reset the owner password for Northwind',
      'Delete Northwind',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  /**
   * A suspended store offers Activate where a live one offers Suspend. Two
   * icons in one position, so the name is the only thing telling them apart.
   */
  it('offers Activate on a suspended store and Suspend on a live one', async () => {
    render(<Tenants />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Suspend Northwind' })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Activate Voltway' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend Voltway' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate Northwind' })).not.toBeInTheDocument();
  });

  /** The same words as the label, so a hover says what the icon means. */
  it('repeats the name as a tooltip', async () => {
    render(<Tenants />);
    const del = await screen.findByRole('button', { name: 'Delete Northwind' });
    expect(del).toHaveAttribute('title', 'Delete Northwind');
  });

  it('leaves no bare text link behind in the row', async () => {
    render(<Tenants />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Northwind' })).toBeInTheDocument());

    // The old labels, which said the same thing twenty times down the column.
    ['Owner password', 'Add admin'].forEach((label) => {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    });
  });
});
