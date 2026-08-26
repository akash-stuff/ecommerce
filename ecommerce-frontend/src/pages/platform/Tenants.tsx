import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformService, type PlatformTenant } from '@/services/platform.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';

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
  const [reason, setReason] = useState('');

  const status = params.get('status') ?? '';

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
      setCreating(null);
      refresh();
    },
  });

  const suspend = useMutation({
    mutationFn: (id: string) => platformService.suspendTenant(id, reason),
    onSuccess: () => {
      setSuspending(null);
      setReason('');
      refresh();
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
        <span className="flex justify-end gap-3">
          {t.status === 'ACTIVE' ? (
            <button onClick={() => setSuspending(t)} className="text-xs text-red-600 underline">
              Suspend
            </button>
          ) : (
            <button
              onClick={() => activate.mutate(t.id)}
              disabled={activate.isPending}
              className="text-xs underline"
            >
              Activate
            </button>
          )}
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
