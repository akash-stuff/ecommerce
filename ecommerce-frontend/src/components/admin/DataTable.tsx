import { ChevronLeft, ChevronRight, Inbox, SearchX } from 'lucide-react';
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
  emptyAction,
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
  /** The thing to do about an empty table, when there is one. */
  emptyAction?: React.ReactNode;
  /** True when a search or filter is active, which changes the empty message. */
  filtered?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <div className="overflow-hidden rounded-card border border-ink-100 bg-white shadow-card">
        {/* Skeleton rows rather than the word "Loading", so the table does not
            collapse to one line and then shove the page down when data lands.
            The word is still announced, for anyone who cannot see the shimmer. */}
        {isLoading && (
          <div className="p-4" aria-busy="true">
            <span className="sr-only">Loading…</span>
            {Array.from({ length: 6 }).map((_, row) => (
              <div
                key={row}
                className="flex items-center gap-4 border-b border-ink-50 py-3 last:border-0"
              >
                {columns.map((column, cell) => (
                  <div
                    key={column.header}
                    className="skeleton h-3.5"
                    // Varied widths: equal bars read as a chart, not as text.
                    style={{ width: cell === 0 ? '28%' : `${Math.max(18 - cell * 2, 8)}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-ink-700">This couldn&apos;t be loaded.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded px-1 text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-950"
            >
              Try again
            </button>
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-50 text-ink-400">
              {filtered ? <SearchX size={18} /> : <Inbox size={18} />}
            </div>
            <p className="text-sm font-medium text-ink-900">
              {filtered ? 'Nothing matches that search' : emptyTitle}
            </p>
            {(filtered || emptyHint) && (
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
                {filtered ? 'Try a different term or clear the filter.' : emptyHint}
              </p>
            )}
            {!filtered && emptyAction && (
              <div className="mt-5 flex justify-center">{emptyAction}</div>
            )}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              {/* Tinted rather than sticky: the wrapper scrolls horizontally,
                  which makes it the containing block for a sticky header, and
                  it has no constrained height to scroll vertically within. */}
              <thead className="bg-ink-50/70 text-xs uppercase tracking-wide text-ink-500">
                <tr className="border-b border-ink-100">
                  {columns.map((c) => (
                    <th key={c.header} className={`px-4 py-2.5 font-medium ${c.className ?? ''}`}>
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
                    className={`border-b border-ink-50 transition-colors last:border-0 ${
                      onRowClick ? 'cursor-pointer hover:bg-ink-50' : ''
                    }`}
                  >
                    {columns.map((c) => (
                      <td key={c.header} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="numeric text-ink-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={meta.page === 1}
              onClick={() => onPage(meta.page - 1)}
              className="inline-flex h-8 items-center gap-1 rounded-card border border-ink-200 bg-white pl-2 pr-3 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              type="button"
              disabled={!meta.hasNext}
              onClick={() => onPage(meta.page + 1)}
              className="inline-flex h-8 items-center gap-1 rounded-card border border-ink-200 bg-white pl-3 pr-2 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
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
    active: 'bg-green-50 text-green-700 ring-green-600/15',
    // A page is published, not "active" — the pair a shopkeeper is choosing
    // between on that screen is published/draft.
    published: 'bg-green-50 text-green-700 ring-green-600/15',
    paid: 'bg-green-50 text-green-700 ring-green-600/15',
    sent: 'bg-green-50 text-green-700 ring-green-600/15',
    delivered: 'bg-green-50 text-green-700 ring-green-600/15',
    queued: 'bg-amber-50 text-amber-800 ring-amber-600/15',
    confirmed: 'bg-blue-50 text-blue-700 ring-blue-600/15',
    shipped: 'bg-blue-50 text-blue-700 ring-blue-600/15',
    pending: 'bg-amber-50 text-amber-800 ring-amber-600/15',
    failed: 'bg-red-50 text-red-700 ring-red-600/15',
    cancelled: 'bg-red-50 text-red-700 ring-red-600/15',
    refunded: 'bg-red-50 text-red-700 ring-red-600/15',
    archived: 'bg-ink-100 text-ink-500 ring-ink-950/10',
    retired: 'bg-ink-100 text-ink-500 ring-ink-950/10',
    draft: 'bg-ink-100 text-ink-500 ring-ink-950/10',
    'opted out': 'bg-ink-100 text-ink-500 ring-ink-950/10',
    subscribed: 'bg-green-50 text-green-700 ring-green-600/15',
  };

  const key = value.toLowerCase();
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs capitalize ring-1 ring-inset ${
        tone[key] ?? 'bg-ink-50 text-ink-700 ring-ink-950/10'
      }`}
    >
      {key.replace(/_/g, ' ')}
    </span>
  );
}
