import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Mail, Trash2 } from 'lucide-react';
import {
  subscriberService,
  type NewsletterSubscriber,
} from '@/services/admin.service';
import { DangerButton, EmptyState, Page, SecondaryButton } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { FormError, Modal } from '@/components/admin/Modal';
import { toast, toastFromError } from '@/components/Toasts';

const FILTERS: { label: string; value: boolean | undefined }[] = [
  { label: 'On the list', value: true },
  { label: 'Opted out', value: false },
  { label: 'Everyone', value: undefined },
];

/**
 * Addresses left in the storefront's mailing-list panel.
 *
 * Deliberately not folded into Customers: these people have no account and have
 * not proven they own the address, so mixing them into the customer list would
 * overstate what is known about them.
 */
export default function Subscribers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<NewsletterSubscriber | null>(null);

  const subscribed = FILTERS[filter].value;

  const query = useQuery({
    queryKey: ['subscribers', page, search, subscribed],
    queryFn: () =>
      subscriberService.list({
        page,
        limit: 25,
        search: search || undefined,
        subscribed,
      }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['subscribers'] });

  const optOut = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (row: NewsletterSubscriber) => subscriberService.unsubscribe(row.id),
    onSuccess: (_r, row) => {
      toast.saved('Taken off the list', `${row.email} will not be mailed again.`);
      refresh();
    },
  });

  const remove = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (row: NewsletterSubscriber) => subscriberService.remove(row.id),
    onSuccess: () => {
      toast.saved('Subscriber deleted');
      setConfirmDelete(null);
      refresh();
    },
  });

  const download = useMutation({
    onError: (e) => toastFromError(e, 'The export could not be built.'),
    mutationFn: subscriberService.exportCsv,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'subscribers.csv';
      a.click();
      // Revoked straight away: the download has already been handed to the
      // browser, and holding the object URL keeps the whole file in memory.
      URL.revokeObjectURL(url);
      toast.saved('Export downloaded', 'subscribers.csv');
    },
  });

  const columns: Column<NewsletterSubscriber>[] = [
    {
      header: 'Email',
      cell: (s) => <span className="font-medium text-ink-950">{s.email}</span>,
    },
    {
      header: 'Signed up',
      cell: (s) => new Date(s.createdAt).toLocaleDateString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'From',
      cell: (s) => <span className="text-xs text-ink-500">{s.source}</span>,
    },
    {
      header: 'Status',
      // Same words as the filter above it: on the list, or opted out.
      cell: (s) => <StatusBadge value={s.unsubscribedAt ? 'opted out' : 'subscribed'} />,
    },
    {
      header: '',
      cell: (s) => (
        <span className="flex items-center justify-end gap-3">
          {!s.unsubscribedAt && (
            <button
              type="button"
              onClick={() => optOut.mutate(s)}
              disabled={optOut.isPending}
              className="inline-flex items-center gap-1.5 text-xs underline disabled:opacity-50"
            >
              {optOut.isPending && optOut.variables?.id === s.id && (
                <Loader2 size={11} className="animate-spin" />
              )}
              Take off
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmDelete(s)}
            aria-label={`Delete ${s.email}`}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </span>
      ),
      className: 'text-right',
    },
  ];

  const filtered = Boolean(search) || subscribed !== true;
  const nothingAtAll = query.data?.items.length === 0 && !filtered;

  return (
    <Page
      title="Subscribers"
      subtitle={
        query.data?.meta
          ? `${query.data.meta.total} ${
              subscribed === true ? 'on the list' : subscribed === false ? 'opted out' : 'in total'
            }`
          : 'Addresses left in your storefront’s mailing-list panel'
      }
      action={
        <SecondaryButton
          disabled={download.isPending || nothingAtAll}
          onClick={() => download.mutate()}
        >
          {download.isPending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Export CSV
        </SecondaryButton>
      }
    >
      {!nothingAtAll && (
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by address"
            aria-label="Search by address"
            className="min-w-0 flex-1 rounded-card border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 transition-colors hover:border-ink-300 focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950 sm:max-w-xs"
          />

          <div className="flex gap-1 rounded-card border border-ink-100 bg-white p-1">
            {FILTERS.map((f, i) => (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  setFilter(i);
                  setPage(1);
                }}
                aria-pressed={filter === i}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  filter === i ? 'bg-ink-950 text-white' : 'text-ink-700 hover:bg-ink-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {nothingAtAll ? (
        <EmptyState
          icon={<Mail size={18} />}
          title="Nobody has signed up yet"
          hint="The mailing-list panel on your homepage collects addresses here. Switch it on under Appearance if it is not showing."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={query.data?.items}
          meta={query.data?.meta}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onPage={setPage}
          filtered={filtered}
          emptyTitle="Nobody matches that"
          rowKey={(s) => s.id}
        />
      )}

      {confirmDelete && (
        <Modal
          title="Delete this subscriber?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setConfirmDelete(null)}>Keep it</SecondaryButton>
              <DangerButton
                disabled={remove.isPending}
                onClick={() => remove.mutate(confirmDelete)}
              >
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </DangerButton>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            <span className="font-medium text-ink-950">{confirmDelete.email}</span> is removed
            entirely, so a later signup from that address counts as a new one.
          </p>
          <p className="mt-3 text-sm text-ink-500">
            To stop mailing them while keeping the record that they asked to be left alone, use
            Take off instead.
          </p>
          <FormError error={remove.error} />
        </Modal>
      )}
    </Page>
  );
}
