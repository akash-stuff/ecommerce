import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { platformService, type PlatformTenant } from '@/services/platform.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';
import { toast, toastFromError } from '@/components/Toasts';
import { env } from '@/config/env';

const STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED'];

/** Mirrors CreateTenantDto's MinLength(10) so the button is not a dead end. */
const MIN_PASSWORD = 10;

interface NewTenant {
  businessName: string;
  slug: string;
  storeName: string;
  email: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerPassword: string;
  planId: string;
  templateId: string;
}

/**
 * What the platform may change about a store after it exists.
 *
 * Slug is absent on purpose: it is baked into the store's hostname, its stored
 * `Domain` rows and every link anyone has saved, so renaming it is a migration
 * rather than an edit. Shown read-only in the form so the operator can see
 * which store they are editing.
 */
interface EditTenant {
  id: string;
  slug: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string;
}

const blank: NewTenant = {
  businessName: '',
  slug: '',
  storeName: '',
  email: '',
  ownerEmail: '',
  ownerFirstName: '',
  ownerPassword: '',
  planId: '',
  templateId: '',
};

export default function Tenants() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<NewTenant | null>(null);
  const [suspending, setSuspending] = useState<PlatformTenant | null>(null);
  /** The store whose owner password is about to be replaced, or null. */
  const [resetting, setResetting] = useState<PlatformTenant | null>(null);
  /**
   * The password that was just issued. Held only in this component's state:
   * it is shown once, and closing the dialog is the only copy anyone gets.
   */
  const [issued, setIssued] = useState<{
    email: string;
    temporaryPassword: string;
    otherStores: number;
  } | null>(null);
  const [editing, setEditing] = useState<EditTenant | null>(null);
  const [deleting, setDeleting] = useState<PlatformTenant | null>(null);
  // Typed back to confirm a delete. Kept out of `deleting` so closing the
  // dialog and reopening it does not carry a half-typed slug forward.
  const [confirmSlug, setConfirmSlug] = useState('');
  const [reason, setReason] = useState('');

  const status = params.get('status') ?? '';

  /**
   * `?new=1` opens the create form.
   *
   * The Overview links here to add a store, and a link that lands on a list the
   * reader then has to find a button on is a link that did half its job. The
   * parameter is consumed on arrival so a refresh does not reopen the form over
   * whatever the user did next.
   */
  useEffect(() => {
    if (params.get('new') === null) return;
    setCreating(blank);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const query = useQuery({
    queryKey: ['platform-tenants', page, search, status],
    queryFn: () =>
      platformService.tenants({
        page,
        limit: 20,
        search: search || undefined,
        status: status || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const plans = useQuery({ queryKey: ['platform-plans'], queryFn: platformService.plans });

  // The gallery, not the full list: a retired template must not be offered.
  const templates = useQuery({
    queryKey: ['platform-template-gallery'],
    queryFn: platformService.templateGallery,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
    queryClient.invalidateQueries({ queryKey: ['platform-overview'] });
  };

  const create = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (t: NewTenant) =>
      platformService.createTenant({
        businessName: t.businessName,
        slug: t.slug,
        storeName: t.storeName || t.businessName,
        email: t.email,
        ownerEmail: t.ownerEmail,
        ownerPassword: t.ownerPassword,
        ownerFirstName: t.ownerFirstName,
        planId: t.planId || undefined,
        templateId: t.templateId || undefined,
      }),
    onSuccess: () => {
      toast.saved('Store created');
      setCreating(null);
      refresh();
    },
  });

  const save = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (t: EditTenant) =>
      platformService.updateTenant(t.id, {
        businessName: t.businessName,
        contactEmail: t.contactEmail,
        contactPhone: t.contactPhone || undefined,
      }),
    onSuccess: () => {
      toast.saved('Store updated');
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: ({ id, slug }: { id: string; slug: string }) =>
      platformService.deleteTenant(id, slug),
    onSuccess: (result) => {
      toast.saved(`${result.slug} deleted`, 'The store and all of its data are gone.');
      queryClient.invalidateQueries({ queryKey: ['platform-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['platform-overview'] });
      setDeleting(null);
      setConfirmSlug('');
    },
  });

  const suspend = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (id: string) => platformService.suspendTenant(id, reason),
    onSuccess: () => {
      toast.saved('Store suspended');
      setSuspending(null);
      setReason('');
      refresh();
    },
  });

  const resetOwner = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (id: string) => platformService.resetOwnerPassword(id),
    onSuccess: (result) => {
      setResetting(null);
      setIssued(result);
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) => platformService.activateTenant(id),
    onSuccess: refresh,
  });

  const columns: Column<PlatformTenant>[] = [
    {
      header: 'Store',
      cell: (t) => (
        <>
          <span className="text-ink-900">{t.businessName}</span>
          <span className="block font-mono text-xs text-ink-500">{t.slug}</span>
        </>
      ),
    },
    { header: 'Contact', cell: (t) => <span className="text-ink-700">{t.contactEmail}</span> },
    {
      /**
       * A newly created store is unpublished, and the storefront answers as if
       * it does not exist. Without this column that looks like a broken deploy
       * rather than a switch nobody has flipped yet.
       */
      header: 'Storefront',
      cell: (t) =>
        t.store?.isPublished ? (
          <span className="text-xs text-green-700">Live</span>
        ) : (
          <span className="text-xs text-amber-700">Not published</span>
        ),
    },
    {
      header: 'Created',
      cell: (t) => new Date(t.createdAt).toLocaleDateString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Status',
      cell: (t) => (
        <span title={t.suspensionReason ?? undefined}>
          <StatusBadge value={t.status} />
        </span>
      ),
    },
    {
      header: '',
      cell: (t) => (
        <span className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() =>
              setEditing({
                id: t.id,
                slug: t.slug,
                businessName: t.businessName,
                contactEmail: t.contactEmail ?? '',
                contactPhone: t.contactPhone ?? '',
              })
            }
            className="text-xs underline"
          >
            Edit
          </button>

          {t.status === 'ACTIVE' ? (
            <button
              type="button"
              onClick={() => setSuspending(t)}
              className="text-xs text-amber-700 underline"
            >
              Suspend
            </button>
          ) : (
            <button
              type="button"
              onClick={() => activate.mutate(t.id)}
              disabled={activate.isPending}
              className="text-xs underline"
            >
              Activate
            </button>
          )}

          <button
            type="button"
            onClick={() => setResetting(t)}
            className="text-xs underline"
          >
            Owner password
          </button>

          {/* Last, and the only red one. Suspension is the reversible action
              and should be the easier one to reach. */}
          <button
            type="button"
            onClick={() => {
              setDeleting(t);
              setConfirmSlug('');
            }}
            aria-label={`Delete ${t.businessName}`}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </span>
      ),
      className: 'text-right',
    },
  ];

  return (
    <Page
      title="Stores"
      subtitle={query.data?.meta ? `${query.data.meta.total} on the platform` : 'Every tenant'}
      action={<PrimaryButton onClick={() => setCreating(blank)}>Add store</PrimaryButton>}
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name or slug"
          aria-label="Search stores"
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
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <FormError error={activate.error} />

      <DataTable
        columns={columns}
        rows={query.data?.items}
        meta={query.data?.meta}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onPage={setPage}
        filtered={Boolean(search || status)}
        emptyTitle="No stores yet"
        emptyHint="Add one to get started."
        rowKey={(t) => t.id}
      />

      {creating && (
        <Modal
          title="Add a store"
          onClose={() => setCreating(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setCreating(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={
                  create.isPending ||
                  !creating.businessName ||
                  !creating.slug ||
                  !creating.ownerEmail ||
                  creating.ownerPassword.length < MIN_PASSWORD
                }
                onClick={() => create.mutate(creating)}
              >
                {create.isPending ? 'Creating…' : 'Create store'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Business name" wide>
              <Input
                value={creating.businessName}
                onChange={(e) =>
                  setCreating({
                    ...creating,
                    businessName: e.target.value,
                    // Suggested, not forced — the slug becomes their subdomain
                    // and is the one field they cannot change later.
                    slug: creating.slug || slugify(e.target.value),
                  })
                }
              />
            </Field>

            <Field label="Slug" hint="Becomes slug.yourplatform.com — permanent">
              <Input
                value={creating.slug}
                onChange={(e) => setCreating({ ...creating, slug: slugify(e.target.value) })}
              />
            </Field>

            <Field label="Store name" hint="Shown to shoppers; defaults to the business name">
              <Input
                value={creating.storeName}
                onChange={(e) => setCreating({ ...creating, storeName: e.target.value })}
              />
            </Field>

            <Field label="Billing contact email" wide>
              <Input
                type="email"
                value={creating.email}
                onChange={(e) => setCreating({ ...creating, email: e.target.value })}
              />
            </Field>

            <Field label="Owner first name">
              <Input
                value={creating.ownerFirstName}
                onChange={(e) => setCreating({ ...creating, ownerFirstName: e.target.value })}
              />
            </Field>

            <Field label="Owner email" hint="They sign in with this">
              <Input
                type="email"
                value={creating.ownerEmail}
                onChange={(e) => setCreating({ ...creating, ownerEmail: e.target.value })}
              />
            </Field>

            <Field
              label="Temporary password"
              hint={`At least ${MIN_PASSWORD} characters. Send it to them out of band.`}
            >
              <Input
                value={creating.ownerPassword}
                onChange={(e) => setCreating({ ...creating, ownerPassword: e.target.value })}
              />
            </Field>

            <Field label="Plan">
              <Select
                value={creating.planId}
                onChange={(e) => setCreating({ ...creating, planId: e.target.value })}
              >
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

            <Field
              label="Template"
              hint="Sets the starting colours, fonts and homepage sections"
            >
              <Select
                value={creating.templateId}
                onChange={(e) => setCreating({ ...creating, templateId: e.target.value })}
              >
                {/* Blank is not "no template": the API falls back to the general
                    store so a new storefront is never left without a theme. */}
                <option value="">General store (default)</option>
                {(templates.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.category}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>

          <p className="mt-4 text-xs text-ink-500">
            The store is created unpublished so the owner can add products before
            anyone can visit. They publish it from Settings, or you can.
          </p>

          <FormError error={create.error} />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Edit ${editing.businessName}`}
          description="Who the platform contacts about this store."
          onClose={() => setEditing(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !editing.businessName || !editing.contactEmail}
                onClick={() => save.mutate(editing)}
              >
                {save.isPending ? 'Saving…' : 'Save changes'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Business name" wide>
              <Input
                value={editing.businessName}
                onChange={(e) => setEditing({ ...editing, businessName: e.target.value })}
              />
            </Field>

            <Field
              label="Address"
              hint="Baked into the hostname and every saved link — changing it would be a migration, not an edit."
              wide
            >
              <Input value={`${editing.slug}.${env.platformDomain}`} disabled readOnly />
            </Field>

            <Field label="Contact email">
              <Input
                type="email"
                value={editing.contactEmail}
                onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })}
              />
            </Field>

            <Field label="Contact phone (optional)">
              <Input
                value={editing.contactPhone}
                onChange={(e) => setEditing({ ...editing, contactPhone: e.target.value })}
              />
            </Field>
          </FormGrid>

          <p className="mt-4 text-xs text-ink-500">
            Branding, products and payments belong to the store owner and are changed from their
            own admin, not here.
          </p>

          <FormError error={save.error} />
        </Modal>
      )}

      {deleting && (
        <Modal
          title={`Delete ${deleting.businessName}?`}
          onClose={() => {
            setDeleting(null);
            setConfirmSlug('');
          }}
          footer={
            <>
              <SecondaryButton
                onClick={() => {
                  setDeleting(null);
                  setConfirmSlug('');
                }}
              >
                Keep it
              </SecondaryButton>
              <button
                type="button"
                // Enabled only once the slug matches. The API checks this too —
                // this half is so the button cannot be clicked by reflex.
                disabled={
                  remove.isPending ||
                  confirmSlug !== deleting.slug ||
                  (deleting._count?.orders ?? 0) > 0
                }
                onClick={() => remove.mutate({ id: deleting.id, slug: confirmSlug })}
                className="inline-flex h-9 items-center rounded-card bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-40"
              >
                {remove.isPending ? 'Deleting…' : 'Delete permanently'}
              </button>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-card border border-red-100 bg-red-50 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700" />
            <p className="text-sm text-red-800">
              This deletes the store and everything under it — products, customers, orders,
              payments and its storefront address. It cannot be undone.
            </p>
          </div>

          {/* Said before the slug is typed, not after the request comes back:
              the operator should know this store cannot be deleted while they
              still have the option of suspending it instead. */}
          {(deleting._count?.orders ?? 0) > 0 ? (
            <p className="mt-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This store has {deleting._count?.orders} order
              {deleting._count?.orders === 1 ? '' : 's'}, so the platform will refuse to delete it.
              Those records are what a merchant answers a chargeback or a tax question with.
              Suspend it instead — that stops it trading and keeps the history.
            </p>
          ) : (
            <p className="mt-4 text-sm text-ink-700">
              This store has taken no orders, so there is no sales history to lose.
            </p>
          )}

          <div className="mt-5">
            <Field
              label={`Type ${deleting.slug} to confirm`}
              hint="So a destructive action is never one stray click away."
            >
              <Input
                value={confirmSlug}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder={deleting.slug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                className="font-mono"
              />
            </Field>
          </div>

          <FormError error={remove.error} />
        </Modal>
      )}

      {/* Two steps, because this cannot be undone: the old password is gone the
          moment it is replaced, and whoever was signed in is signed out. */}
      {resetting && (
        <Modal
          title={`Reset the owner password for ${resetting.businessName}?`}
          onClose={() => setResetting(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setResetting(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={resetOwner.isPending}
                onClick={() => resetOwner.mutate(resetting.id)}
              >
                {resetOwner.isPending ? 'Resetting…' : 'Reset password'}
              </PrimaryButton>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            A new password is generated and shown to you once. Nothing is emailed — you pass it
            on yourself.
          </p>
          <p className="mt-3 text-sm text-ink-700">
            The owner&apos;s current password stops working immediately, and every device they
            are signed in on is signed out.
          </p>
          <p className="mt-3 text-sm text-ink-500">
            A sign-in belongs to a person, not to a store. If this owner runs other stores on the
            platform, this is the password for those too.
          </p>
          <FormError error={resetOwner.error} />
        </Modal>
      )}

      {/* Shown once. There is no second chance to read it, which the dialog
          says rather than leaving someone to find out by closing it. */}
      {issued && (
        <Modal
          title="New owner password"
          onClose={() => setIssued(null)}
          footer={<PrimaryButton onClick={() => setIssued(null)}>Done</PrimaryButton>}
        >
          <p className="text-sm text-ink-700">
            Give this to <strong className="text-ink-950">{issued.email}</strong>. It is not
            stored and not emailed, so this is the only time it is shown.
          </p>

          <div className="mt-4 flex items-center gap-3 rounded-card border border-ink-200 bg-ink-50 px-4 py-3">
            {/* Selectable as one run: the next thing anyone does with this is
                copy it. */}
            <code className="select-all flex-1 break-all font-mono text-sm text-ink-950">
              {issued.temporaryPassword}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(issued.temporaryPassword)}
              className="shrink-0 text-xs text-ink-600 underline hover:text-ink-950"
            >
              Copy
            </button>
          </div>

          {issued.otherStores > 0 && (
            <p className="mt-4 rounded-card bg-amber-50 px-4 py-3 text-sm text-amber-900">
              This login also opens {issued.otherStores} other{' '}
              {issued.otherStores === 1 ? 'store' : 'stores'} on the platform. Their password has
              changed too.
            </p>
          )}

          <p className="mt-4 text-xs text-ink-500">
            Ask them to change it after signing in.
          </p>
        </Modal>
      )}

      {suspending && (
        <Modal
          title={`Suspend ${suspending.businessName}?`}
          onClose={() => setSuspending(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setSuspending(null)}>Keep it running</SecondaryButton>
              <button
                onClick={() => suspend.mutate(suspending.id)}
                disabled={suspend.isPending || !reason.trim()}
                className="rounded-card bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {suspend.isPending ? 'Suspending…' : 'Suspend store'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            The storefront stops answering immediately and every signed-in staff member is
            logged out. Their data is untouched and activating restores everything.
          </p>
          <div className="mt-4">
            <Field label="Reason" hint="Recorded in the audit log">
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <FormError error={suspend.error} />
        </Modal>
      )}
    </Page>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}
