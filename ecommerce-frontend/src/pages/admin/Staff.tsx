import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, Trash2, UserPlus, Users } from 'lucide-react';
import { staffService, type StaffMember } from '@/services/admin.service';
import {
  Card,
  DangerButton,
  EmptyState,
  Page,
  PrimaryButton,
  SecondaryButton,
} from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select } from '@/components/admin/Modal';
import { toast, toastFromError } from '@/components/Toasts';

type Assignable = 'TENANT_ADMIN' | 'STAFF';

const ROLE_LABEL: Record<string, string> = {
  TENANT_OWNER: 'Owner',
  TENANT_ADMIN: 'Administrator',
  STAFF: 'Staff',
};

/** What each role actually means, in the words of someone running a shop. */
const ROLE_BLURB: Record<Assignable, string> = {
  TENANT_ADMIN:
    'Runs the shop day to day: products, orders, customers, appearance, shipping and coupons. Cannot add staff or connect the payment account.',
  STAFF:
    'Reads the catalogue and works the orders. Cannot change products, prices, appearance or any setting.',
};

const blank = { email: '', firstName: '', lastName: '', phone: '', role: 'STAFF' as Assignable };

export default function Staff() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<typeof blank | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<StaffMember | null>(null);
  /**
   * The one-time password, held only in this component's state.
   *
   * The server returns it once and stores nothing readable; it is deliberately
   * not emailed either, because notification bodies are persisted. So this
   * panel is the only place it will ever exist — hence the explicit warning
   * that closing it loses it.
   */
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const query = useQuery({
    queryKey: ['staff', page, search],
    queryFn: () => staffService.list({ page, limit: 25, search: search || undefined }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff'] });

  const add = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (d: typeof blank) =>
      staffService.create({
        email: d.email,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone || undefined,
        role: d.role,
      }),
    onSuccess: (created) => {
      setDraft(null);
      refresh();
      if (created.temporaryPassword) {
        setIssued({ email: created.email, password: created.temporaryPassword });
      } else {
        toast.saved(
          'Access granted',
          `${created.email} already had an account, so their existing password still works.`,
        );
      }
    },
  });

  const change = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: ({ row, patch }: { row: StaffMember; patch: { role?: Assignable; isActive?: boolean } }) =>
      staffService.update(row.id, patch),
    onSuccess: (_r, { row, patch }) => {
      toast.saved(
        patch.isActive === false ? 'Access suspended' : patch.isActive ? 'Access restored' : 'Role changed',
        row.email,
      );
      refresh();
    },
  });

  const reset = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (row: StaffMember) => staffService.resetPassword(row.id),
    onSuccess: (r, row) => setIssued({ email: row.email, password: r.temporaryPassword }),
  });

  const remove = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (row: StaffMember) => staffService.remove(row.id),
    onSuccess: (_r, row) => {
      toast.saved('Removed from this store', row.email);
      setConfirmRemove(null);
      refresh();
    },
  });

  const columns: Column<StaffMember>[] = [
    {
      header: 'Name',
      cell: (s) => (
        <span>
          <span className="font-medium text-ink-950">
            {s.firstName} {s.lastName}
          </span>
          {s.isSelf && <span className="ml-2 text-xs text-ink-400">you</span>}
          <span className="block text-xs text-ink-500">{s.email}</span>
        </span>
      ),
    },
    {
      header: 'Role',
      cell: (s) =>
        // The owner is fixed; everyone else is a live control, so the row reads
        // as editable exactly where it is.
        s.role === 'TENANT_OWNER' || s.isSelf ? (
          <span className="text-sm text-ink-700">{ROLE_LABEL[s.role]}</span>
        ) : (
          <select
            value={s.role}
            disabled={change.isPending}
            onChange={(e) => change.mutate({ row: s, patch: { role: e.target.value as Assignable } })}
            aria-label={`Role for ${s.email}`}
            className="rounded-card border border-ink-200 bg-white px-2 py-1 text-sm text-ink-950 transition-colors hover:border-ink-300 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
          >
            <option value="TENANT_ADMIN">Administrator</option>
            <option value="STAFF">Staff</option>
          </select>
        ),
    },
    {
      header: 'Last signed in',
      cell: (s) =>
        s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleDateString() : (
          <span className="text-ink-400">never</span>
        ),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Status',
      cell: (s) => <StatusBadge value={s.isActive ? 'active' : 'suspended'} />,
    },
    {
      header: '',
      cell: (s) =>
        s.role === 'TENANT_OWNER' || s.isSelf ? (
          <span className="text-xs text-ink-400">—</span>
        ) : (
          <span className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => change.mutate({ row: s, patch: { isActive: !s.isActive } })}
              disabled={change.isPending}
              className="text-xs underline disabled:opacity-50"
            >
              {s.isActive ? 'Suspend' : 'Restore'}
            </button>
            <button
              type="button"
              onClick={() => reset.mutate(s)}
              disabled={reset.isPending}
              aria-label={`Reset password for ${s.email}`}
              title="Issue a new one-time password"
              className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 disabled:opacity-50"
            >
              {reset.isPending && reset.variables?.id === s.id ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(s)}
              aria-label={`Remove ${s.email}`}
              className="rounded p-1 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </span>
        ),
      className: 'text-right',
    },
  ];

  const onlyOwner = query.data?.items.length === 1 && query.data.items[0].role === 'TENANT_OWNER';

  return (
    <Page
      title="Staff"
      subtitle="Who can sign in to this store, and what they can do"
      action={
        <PrimaryButton onClick={() => setDraft(blank)}>
          <UserPlus size={15} />
          Add someone
        </PrimaryButton>
      }
    >
      {issued && (
        <OneTimePassword
          email={issued.email}
          password={issued.password}
          onDone={() => setIssued(null)}
        />
      )}

      {!onlyOwner && (
        <div className="mb-4">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email"
            aria-label="Search staff"
            className="w-full rounded-card border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 transition-colors hover:border-ink-300 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:max-w-xs"
          />
        </div>
      )}

      {onlyOwner && !search ? (
        <EmptyState
          icon={<Users size={18} />}
          title="It is just you so far"
          hint="Add an administrator to help run the shop, or staff to work the orders. They sign in at the same address you do."
          action={<PrimaryButton onClick={() => setDraft(blank)}>Add someone</PrimaryButton>}
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
          filtered={Boolean(search)}
          emptyTitle="Nobody matches that"
          rowKey={(s) => s.id}
        />
      )}

      <FormError error={change.error} />

      {draft && (
        <Modal
          title="Add someone to this store"
          description="They sign in at the same address you do, with their own password."
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={
                  add.isPending ||
                  !draft.email.trim() ||
                  !draft.firstName.trim() ||
                  !draft.lastName.trim()
                }
                onClick={() => add.mutate(draft)}
              >
                {add.isPending ? 'Adding…' : 'Add and issue a password'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="First name">
              <Input
                value={draft.firstName}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
              />
            </Field>
            <Field label="Last name">
              <Input
                value={draft.lastName}
                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
              />
            </Field>
            <Field label="Email" hint="This is what they sign in with." wide>
              <Input
                type="email"
                value={draft.email}
                spellCheck={false}
                placeholder="name@example.com"
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>
            <Field label="Phone" hint="Optional">
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <Select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Assignable })}
              >
                <option value="STAFF">Staff</option>
                <option value="TENANT_ADMIN">Administrator</option>
              </Select>
            </Field>
          </FormGrid>

          {/* What the role means, next to the control that sets it, rather than
              in documentation nobody opens. */}
          <p className="mt-4 rounded-card border border-ink-100 bg-ink-50/60 px-4 py-3 text-xs leading-relaxed text-ink-600">
            <span className="font-medium text-ink-900">{ROLE_LABEL[draft.role]}.</span>{' '}
            {ROLE_BLURB[draft.role]}
          </p>

          <FormError error={add.error} />
        </Modal>
      )}

      {confirmRemove && (
        <Modal
          title={`Remove ${confirmRemove.firstName} from this store?`}
          onClose={() => setConfirmRemove(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setConfirmRemove(null)}>Keep access</SecondaryButton>
              <DangerButton
                disabled={remove.isPending}
                onClick={() => remove.mutate(confirmRemove)}
              >
                {remove.isPending ? 'Removing…' : 'Remove'}
              </DangerButton>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            They lose access to this store immediately. Their account itself is not deleted — if
            they help run another store here, that keeps working.
          </p>
          <p className="mt-3 text-sm text-ink-500">
            To stop them signing in for now without losing the record, use Suspend instead.
          </p>
          <FormError error={remove.error} />
        </Modal>
      )}
    </Page>
  );
}

/**
 * The one-time password, shown once.
 *
 * Deliberately loud and deliberately manual to dismiss: this value exists in
 * exactly one place — this panel — and is unrecoverable once closed. The only
 * way back is issuing a new one, which is what the key button on the row does.
 */
function OneTimePassword({
  email,
  password,
  onDone,
}: {
  email: string;
  password: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Card className="mb-5 border-brand/30 bg-brand/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-950">
            One-time password for {email}
          </p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-600">
            Give this to them yourself — it is not emailed, because message bodies are
            stored. It is shown once; close this and the only way back is a new one.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="select-all rounded-card border border-ink-200 bg-white px-3 py-2 font-mono text-sm tracking-wide text-ink-950">
              {password}
            </code>
            <SecondaryButton
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(password);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </SecondaryButton>
          </div>
        </div>

        <SecondaryButton size="sm" onClick={onDone}>
          I have saved it
        </SecondaryButton>
      </div>
    </Card>
  );
}
