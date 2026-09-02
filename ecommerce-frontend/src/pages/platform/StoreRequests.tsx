import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Check, EyeOff } from 'lucide-react';
import { platformService, type StoreRequest } from '@/services/platform.service';
import { Page } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { Field, FormError, Modal, Select, Textarea } from '@/components/admin/Modal';
import { toast, toastFromError } from '@/components/Toasts';
import { env } from '@/config/env';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DISCARDED'];

/**
 * The registration queue.
 *
 * Approving one provisions a store — the same transaction the Add store form
 * runs — so the confirmation dialog shows the address it is about to take and
 * the person it is about to let in, rather than asking "are you sure".
 *
 * The applicant's password is never on this screen. They chose it when they
 * registered and it was hashed on arrival, so there is nothing here to show and
 * nothing to read out: approval simply makes the login they already have work.
 */
export default function StoreRequests() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [approving, setApproving] = useState<StoreRequest | null>(null);
  const [planId, setPlanId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [rejecting, setRejecting] = useState<StoreRequest | null>(null);
  const [reason, setReason] = useState('');
  const [discarding, setDiscarding] = useState<StoreRequest | null>(null);
  const [reading, setReading] = useState<StoreRequest | null>(null);

  // Defaults to the queue, not the archive: the reason to open this screen is
  // that somebody is waiting.
  const status = params.get('status') ?? 'PENDING';

  const query = useQuery({
    queryKey: ['store-requests', page, search, status],
    queryFn: () =>
      platformService.storeRequests({
        page,
        limit: 20,
        search: search || undefined,
        status: status || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const plans = useQuery({ queryKey: ['platform-plans'], queryFn: platformService.plans });
  const templates = useQuery({
    queryKey: ['platform-template-gallery'],
    queryFn: platformService.templateGallery,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['store-requests'] });
    queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
    queryClient.invalidateQueries({ queryKey: ['platform-overview'] });
  };

  const approve = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (request: StoreRequest) =>
      platformService.approveStoreRequest(request.id, {
        planId: planId || undefined,
        templateId: templateId || undefined,
      }),
    onSuccess: (_result, request) => {
      toast.saved(
        `${request.businessName} is live`,
        `${request.email} can sign in with the password they chose.`,
      );
      setApproving(null);
      setPlanId('');
      setTemplateId('');
      refresh();
    },
  });

  const reject = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (request: StoreRequest) =>
      platformService.rejectStoreRequest(request.id, reason.trim()),
    onSuccess: (_result, request) => {
      toast.saved('Application refused', `${request.email} has been told why.`);
      setRejecting(null);
      setReason('');
      refresh();
    },
  });

  const discard = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (request: StoreRequest) => platformService.discardStoreRequest(request.id),
    onSuccess: () => {
      toast.saved('Taken off the queue', 'Nothing was emailed.');
      setDiscarding(null);
      refresh();
    },
  });

  const columns: Column<StoreRequest>[] = [
    {
      header: 'Business',
      cell: (r) => (
        <>
          <span className="text-ink-900">{r.businessName}</span>
          <span className="block font-mono text-xs text-ink-500">{r.slug}</span>
        </>
      ),
    },
    {
      header: 'Applicant',
      cell: (r) => (
        <>
          <span className="text-ink-700">
            {r.firstName} {r.lastName}
          </span>
          <span className="block text-xs text-ink-500">{r.email}</span>
        </>
      ),
    },
    {
      header: 'Applied',
      cell: (r) => new Date(r.createdAt).toLocaleDateString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Status',
      cell: (r) => (
        <span title={r.reviewNote ?? undefined}>
          <StatusBadge value={r.status} />
        </span>
      ),
    },
    {
      header: '',
      cell: (r) => (
        <span className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => setReading(r)}
            className="rounded-card px-2 py-1 text-xs text-ink-600 underline transition-colors hover:text-ink-950"
          >
            Read
          </button>

          {/* Only a pending application can be decided; the API refuses the
              rest, and offering buttons that will be refused is worse than
              not offering them. */}
          {r.status === 'PENDING' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setApproving(r);
                  setPlanId('');
                  setTemplateId('');
                }}
                aria-label={`Approve ${r.businessName}`}
                title={`Approve ${r.businessName}`}
                className="rounded-card p-2 text-ink-400 transition-colors hover:bg-brand/[0.08] hover:text-brand"
              >
                <Check size={15} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejecting(r);
                  setReason('');
                }}
                aria-label={`Refuse ${r.businessName}`}
                title={`Refuse ${r.businessName}`}
                className="rounded-card p-2 text-ink-400 transition-colors hover:bg-amber-50 hover:text-amber-700"
              >
                <Ban size={15} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onClick={() => setDiscarding(r)}
                aria-label={`Discard ${r.businessName} without telling them`}
                title={`Discard ${r.businessName} without telling them`}
                className="rounded-card p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              >
                <EyeOff size={15} strokeWidth={1.9} />
              </button>
            </>
          )}
        </span>
      ),
      className: 'text-right',
    },
  ];

  return (
    <Page
      title="Applications"
      subtitle={
        query.data?.meta ? `${query.data.meta.total} in this view` : 'People asking for a store'
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search business, address or email"
          aria-label="Search applications"
          className="w-full max-w-xs rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('status', e.target.value);
            else next.delete('status');
            setParams(next);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        meta={query.data?.meta}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onPage={setPage}
        filtered={Boolean(search || status)}
        emptyTitle="Nothing waiting"
        emptyHint="Applications from the registration form land here."
        rowKey={(r) => r.id}
      />

      {reading && (
        <Modal
          title={reading.businessName}
          description={`Applied ${new Date(reading.createdAt).toLocaleString()}`}
          onClose={() => setReading(null)}
          footer={
            <button
              type="button"
              onClick={() => setReading(null)}
              className="rounded-card border border-ink-200 px-4 py-2 text-sm"
            >
              Close
            </button>
          }
        >
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-ink-500">Wants the address</dt>
            <dd className="font-mono text-ink-950">
              {reading.slug}.{env.platformDomain}
            </dd>

            <dt className="text-ink-500">Applicant</dt>
            <dd className="text-ink-950">
              {reading.firstName} {reading.lastName}
            </dd>

            <dt className="text-ink-500">Email</dt>
            <dd className="text-ink-950">{reading.email}</dd>

            {reading.phone && (
              <>
                <dt className="text-ink-500">Mobile</dt>
                <dd className="text-ink-950">{reading.phone}</dd>
              </>
            )}

            {reading.businessCategory && (
              <>
                <dt className="text-ink-500">Sells</dt>
                <dd className="text-ink-950">{reading.businessCategory}</dd>
              </>
            )}

            {reading.reviewedAt && (
              <>
                <dt className="text-ink-500">Decided</dt>
                <dd className="text-ink-950">
                  {new Date(reading.reviewedAt).toLocaleString()}
                  {reading.reviewedBy && ` by ${reading.reviewedBy.email}`}
                </dd>
              </>
            )}
          </dl>

          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
              What they wrote
            </p>
            <p className="mt-2 whitespace-pre-wrap rounded-card bg-ink-50 px-4 py-3 text-sm text-ink-800">
              {reading.message?.trim() || 'Nothing.'}
            </p>
          </div>

          {reading.reviewNote && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-400">
                Reason given
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-card bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {reading.reviewNote}
              </p>
            </div>
          )}
        </Modal>
      )}

      {approving && (
        <Modal
          title={`Approve ${approving.businessName}?`}
          description="This creates the store, its address and its owner account."
          onClose={() => setApproving(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setApproving(null)}
                className="rounded-card border border-ink-200 px-4 py-2 text-sm"
              >
                Not yet
              </button>
              <button
                type="button"
                disabled={approve.isPending}
                onClick={() => approve.mutate(approving)}
                className="cta-primary rounded-card px-4 py-2 text-sm font-medium"
              >
                {approve.isPending ? 'Creating…' : 'Approve and create'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            <strong className="text-ink-950">
              {approving.firstName} {approving.lastName}
            </strong>{' '}
            becomes the owner, signing in as{' '}
            <strong className="text-ink-950">{approving.email}</strong> with the password they chose
            when they applied. Nothing is issued and nothing is emailed to them but the setup link.
          </p>

          <p className="mt-3 rounded-card bg-ink-50 px-4 py-3 font-mono text-sm text-ink-900">
            {approving.slug}.{env.platformDomain}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Plan">
              <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">No plan</option>
                {(plans.data ?? [])
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Template" hint="Their starting colours and layout">
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">General store (default)</option>
                {(templates.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.category}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <p className="mt-4 text-xs text-ink-500">
            The store is created unpublished, so they can add products before anyone can visit.
          </p>

          <FormError error={approve.error} />
        </Modal>
      )}

      {rejecting && (
        <Modal
          title={`Refuse ${rejecting.businessName}?`}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-card border border-ink-200 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reject.isPending || reason.trim().length < 5}
                onClick={() => reject.mutate(rejecting)}
                className="rounded-card bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:pointer-events-none disabled:opacity-40"
              >
                {reject.isPending ? 'Sending…' : 'Refuse and tell them'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            {rejecting.email} is emailed this, as written. Nothing is created and the address stays
            free.
          </p>
          <div className="mt-4">
            <Field label="Why" hint="A sentence they can act on. They may apply again.">
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <FormError error={reject.error} />
        </Modal>
      )}

      {discarding && (
        <Modal
          title={`Discard ${discarding.businessName}?`}
          onClose={() => setDiscarding(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDiscarding(null)}
                className="rounded-card border border-ink-200 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={discard.isPending}
                onClick={() => discard.mutate(discarding)}
                className="rounded-card bg-ink-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {discard.isPending ? 'Discarding…' : 'Discard quietly'}
              </button>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-card border border-ink-100 bg-ink-50 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink-500" />
            <p className="text-sm text-ink-700">
              For a duplicate or something a bot filed. It comes off the queue and{' '}
              <strong className="text-ink-950">nothing is emailed</strong> — use Refuse if a person
              is waiting for an answer.
            </p>
          </div>
          <FormError error={discard.error} />
        </Modal>
      )}
    </Page>
  );
}
