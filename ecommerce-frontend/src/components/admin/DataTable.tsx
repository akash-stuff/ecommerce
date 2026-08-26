import type { PaginationMeta } from '@/types/api';

export interface Column<T> {
  header: string;
  /** Cell content. Kept as a render function so a column can be a badge or a link. */
  cell: (row: T) => React.ReactNode;
  className?: string;
}

/**
 * The list-screen states, in one place: loading, failed, empty, and populated.
 *
 * Every admin screen needs all four and gets them wrong differently otherwise —
 * usually by treating "no rows yet" and "your filter matched nothing" as the
 * same message, which sends the owner looking for a bug that isn't there.
 */
export function DataTable<T>({
  columns,
  rows,
  meta,
  isLoading,
  isError,
  onRetry,
  onPage,
  emptyTitle,
  emptyHint,
  filtered,
  rowKey,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  meta?: PaginationMeta;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onPage?: (page: number) => void;
  emptyTitle: string;
  emptyHint?: string;
  /** True when a search or filter is active, which changes the empty message. */
  filtered?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <div className="overflow-hidden rounded-card border border-ink-100 bg-white">
        {isLoading && <div className="p-8 text-sm text-ink-500">Loading…</div>}

        {isError && (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-700">This couldn't be loaded.</p>
            <button onClick={onRetry} className="mt-2 text-sm font-medium text-ink-950 underline">
              Try again
            </button>
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-ink-700">
              {filtered ? 'Nothing matches that search' : emptyTitle}
            </p>
            {(filtered || emptyHint) && (
              <p className="mt-1 text-sm text-ink-500">
                {filtered ? 'Try a different term or clear the filter.' : emptyHint}
              </p>
            )}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  {columns.map((c) => (
                    <th key={c.header} className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-b border-ink-50 last:border-0 ${
                      onRowClick ? 'cursor-pointer hover:bg-ink-50' : ''
                    }`}
                  >
                    {columns.map((c) => (
                      <td key={c.header} className={`px-4 py-3 ${c.className ?? ''}`}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && onPage && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </span>
          <div className="flex gap-2">
            <button
              disabled={meta.page === 1}
              onClick={() => onPage(meta.page - 1)}
              className="rounded-card border border-ink-100 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={!meta.hasNext}
              onClick={() => onPage(meta.page + 1)}
              className="rounded-card border border-ink-100 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Neutral by default; only states that need attention get colour. */
export function StatusBadge({ value }: { value: string }) {
  const tone: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    paid: 'bg-green-50 text-green-700',
    sent: 'bg-green-50 text-green-700',
    delivered: 'bg-green-50 text-green-700',
    queued: 'bg-amber-50 text-amber-800',
    confirmed: 'bg-blue-50 text-blue-700',
    shipped: 'bg-blue-50 text-blue-700',
    pending: 'bg-amber-50 text-amber-800',
    failed: 'bg-red-50 text-red-700',
    cancelled: 'bg-red-50 text-red-700',
    refunded: 'bg-red-50 text-red-700',
    archived: 'bg-ink-100 text-ink-500',
    retired: 'bg-ink-100 text-ink-500',
    draft: 'bg-ink-100 text-ink-500',
  };

  const key = value.toLowerCase();
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs capitalize ${
        tone[key] ?? 'bg-ink-50 text-ink-700'
      }`}
    >
      {key.replace(/_/g, ' ')}
    </span>
  );
}
