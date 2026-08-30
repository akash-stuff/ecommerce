import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/render';
import { DataTable, StatusBadge, type Column } from './DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [{ header: 'Name', cell: (r) => r.name }];
const rows: Row[] = [{ id: '1', name: 'Wool Scarf' }];

const base = {
  columns,
  isLoading: false,
  isError: false,
  onRetry: vi.fn(),
  emptyTitle: 'No products yet',
  rowKey: (r: Row) => r.id,
};

/**
 * Every admin list uses this, and the states it has to distinguish are the ones
 * that get conflated: "nothing here yet" and "your filter matched nothing" send
 * an owner looking for two completely different problems.
 */
describe('DataTable', () => {
  it('renders rows', () => {
    render(<DataTable {...base} rows={rows} />);
    expect(screen.getByText('Wool Scarf')).toBeInTheDocument();
  });

  it('shows a loading state instead of an empty one while fetching', () => {
    render(<DataTable {...base} rows={undefined} isLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
  });

  it('offers a retry when the load failed', async () => {
    const onRetry = vi.fn();
    render(<DataTable {...base} rows={undefined} isError onRetry={onRetry} />);

    screen.getByRole('button', { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('distinguishes an empty table from an empty filter result', () => {
    const { unmount } = render(<DataTable {...base} rows={[]} />);
    expect(screen.getByText('No products yet')).toBeInTheDocument();
    unmount();

    render(<DataTable {...base} rows={[]} filtered />);
    expect(screen.getByText('Nothing matches that search')).toBeInTheDocument();
    expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
  });

  it('hides pagination for a single page', () => {
    render(
      <DataTable
        {...base}
        rows={rows}
        meta={{ page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false }}
        onPage={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });

  it('disables Next on the last page', () => {
    render(
      <DataTable
        {...base}
        rows={rows}
        meta={{ page: 3, limit: 20, total: 50, totalPages: 3, hasNext: false }}
        onPage={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
  });

  it('reports a row click with the row', () => {
    const onRowClick = vi.fn();
    render(<DataTable {...base} rows={rows} onRowClick={onRowClick} />);

    screen.getByText('Wool Scarf').click();
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});

describe('StatusBadge', () => {
  it('reads as words, not as an enum', () => {
    render(<StatusBadge value="PARTIALLY_REFUNDED" />);
    expect(screen.getByText('partially refunded')).toBeInTheDocument();
  });

  it('colours a failure differently from a success', () => {
    const { unmount } = render(<StatusBadge value="SENT" />);
    expect(screen.getByText('sent').className).toContain('green');
    unmount();

    render(<StatusBadge value="FAILED" />);
    expect(screen.getByText('failed').className).toContain('red');
  });

  /**
   * Every value any screen actually passes, checked against the tone map.
   *
   * The failure this guards is silent: a status with no entry still renders,
   * still reads correctly, and is simply grey — so a reviewer sees a working
   * badge and a shopkeeper loses the one cue that told approved from rejected
   * at a glance. Two enums had drifted out of the map exactly this way.
   *
   * Add the enum value here when the schema gains one; the list is meant to be
   * the full set, not a sample.
   */
  const MEANINGFUL = [
    // OrderStatus
    'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED',
    'CANCELLED', 'REFUNDED',
    // PaymentStatus
    'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED',
    // ShipmentStatus
    'LABEL_CREATED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'RETURNED',
    // ReviewStatus
    'APPROVED', 'REJECTED',
    // NotificationStatus
    'QUEUED', 'SENT', 'FAILED',
    // DomainStatus
    'VERIFYING', 'ACTIVE',
    // SubscriptionStatus
    'TRIALING', 'PAST_DUE',
    // TenantStatus and the literals screens pass directly
    'SUSPENDED', 'published', 'subscribed',
  ];

  it.each(MEANINGFUL)('gives %s a tone rather than falling through to grey', (value) => {
    const { container } = render(<StatusBadge value={value} />);
    const badge = container.querySelector('span');

    // `ink` is the neutral fallback. Anything meaningful must not land on it.
    expect(`${value}: ${badge?.className}`).not.toContain('bg-ink-100');
  });

  /** The states that are genuinely inert should still read as inert. */
  it.each(['draft', 'archived', 'retired', 'opted out'])(
    'leaves %s neutral',
    (value) => {
      const { container } = render(<StatusBadge value={value} />);
      expect(container.querySelector('span')?.className).toContain('bg-ink-100');
    },
  );

  /**
   * Colour alone fails for the ~8% of men with a colour-vision deficiency, and
   * red/green is the exact pair they lose.
   */
  it('carries a dot as well as a colour', () => {
    const { container } = render(<StatusBadge value="DELIVERED" />);
    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(container.querySelector('span span')).toHaveAttribute('aria-hidden', 'true');
  });
});
