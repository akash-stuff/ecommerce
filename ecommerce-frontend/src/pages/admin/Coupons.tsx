import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponService } from '@/services/admin.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select } from '@/components/admin/Modal';
import { formatMoney } from '@/utils/format';
import type { Coupon } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

interface Draft {
  id?: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: string;
  minOrderAmount: string;
  maxDiscountAmount: string;
  usageLimit: string;
  perCustomerLimit: string;
  expiresAt: string;
}

const empty: Draft = {
  code: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  minOrderAmount: '',
  maxDiscountAmount: '',
  usageLimit: '',
  perCustomerLimit: '',
  expiresAt: '',
};

/** Blank optional fields must be omitted, not sent as empty strings. */
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

export default function Coupons() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const query = useQuery({
    queryKey: ['admin-coupons', page, search],
    queryFn: () => couponService.list({ page, limit: 20, search: search || undefined }),
    placeholderData: (previous) => previous,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    setDraft(null);
  };

  const save = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (d: Draft) => {
      const payload = {
        discountValue: num(d.discountValue),
        minOrderAmount: num(d.minOrderAmount),
        maxDiscountAmount: num(d.maxDiscountAmount),
        usageLimit: num(d.usageLimit),
        perCustomerLimit: num(d.perCustomerLimit),
        expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : undefined,
      };
      return d.id
        ? couponService.update(d.id, payload)
        : couponService.create({ ...payload, code: d.code, discountType: d.discountType });
    },
    onSuccess: () => {
      toast.saved('Coupon saved');
      refresh();
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => couponService.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-coupons'] }),
  });

  const columns: Column<Coupon>[] = [
    { header: 'Code', cell: (c) => <span className="font-mono text-xs text-ink-900">{c.code}</span> },
    {
      header: 'Discount',
      cell: (c) =>
        c.discountType === 'PERCENTAGE'
          ? `${Number(c.discountValue)}%${c.maxDiscountAmount ? ` (max ${formatMoney(c.maxDiscountAmount)})` : ''}`
          : formatMoney(c.discountValue),
      className: 'text-ink-900',
    },
    {
      header: 'Minimum',
      cell: (c) => (c.minOrderAmount ? formatMoney(c.minOrderAmount) : '—'),
      className: 'text-ink-700',
    },
    {
      header: 'Used',
      cell: (c) => `${c.usageCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}`,
      className: 'text-ink-700',
    },
    {
      header: 'Expires',
      cell: (c) => (c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'No expiry'),
      className: 'whitespace-nowrap text-ink-500',
    },
    { header: 'Status', cell: (c) => <StatusBadge value={c.isActive ? 'active' : 'archived'} /> },
    {
      header: '',
      cell: (c) => (
        <span className="flex justify-end gap-2">
          <button
            onClick={() =>
              setDraft({
                id: c.id,
                code: c.code,
                discountType: c.discountType,
                discountValue: String(Number(c.discountValue)),
                minOrderAmount: c.minOrderAmount ? String(Number(c.minOrderAmount)) : '',
                maxDiscountAmount: c.maxDiscountAmount ? String(Number(c.maxDiscountAmount)) : '',
                usageLimit: c.usageLimit ? String(c.usageLimit) : '',
                perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : '',
                expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
              })
            }
            className="text-xs underline"
          >
            Edit
          </button>
          {c.isActive && (
            <button
              onClick={() => deactivate.mutate(c.id)}
              className="text-xs text-red-600 underline"
            >
              Deactivate
            </button>
          )}
        </span>
      ),
      className: 'text-right',
    },
  ];

  return (
    <Page
      title="Coupons"
      subtitle={query.data?.meta ? `${query.data.meta.total} created` : 'Discounts you offer'}
      action={<PrimaryButton onClick={() => setDraft(empty)}>Add coupon</PrimaryButton>}
    >
      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search by code"
        aria-label="Search coupons"
        className="mb-4 w-full max-w-xs rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
      />

      <DataTable
        columns={columns}
        rows={query.data?.items}
        meta={query.data?.meta}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onPage={setPage}
        filtered={Boolean(search)}
        emptyTitle="No coupons yet"
        emptyHint="Create one to run a promotion."
        rowKey={(c) => c.id}
      />

      {draft && (
        <Modal
          title={draft.id ? `Edit ${draft.code}` : 'Add coupon'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !draft.code || !draft.discountValue}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Code" hint={draft.id ? 'The code cannot be changed' : 'Shoppers type this at checkout'}>
              <Input
                value={draft.code}
                disabled={Boolean(draft.id)}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              />
            </Field>

            <Field label="Type">
              <Select
                value={draft.discountType}
                disabled={Boolean(draft.id)}
                onChange={(e) =>
                  setDraft({ ...draft, discountType: e.target.value as Draft['discountType'] })
                }
              >
                <option value="PERCENTAGE">Percentage off</option>
                <option value="FIXED">Fixed amount off</option>
              </Select>
            </Field>

            <Field label={draft.discountType === 'PERCENTAGE' ? 'Percent off' : 'Amount off'}>
              <Input
                type="number"
                min={0}
                value={draft.discountValue}
                onChange={(e) => setDraft({ ...draft, discountValue: e.target.value })}
              />
            </Field>

            {draft.discountType === 'PERCENTAGE' && (
              <Field label="Cap the discount at" hint="Optional ceiling on a percentage">
                <Input
                  type="number"
                  min={0}
                  value={draft.maxDiscountAmount}
                  onChange={(e) => setDraft({ ...draft, maxDiscountAmount: e.target.value })}
                />
              </Field>
            )}

            <Field label="Minimum order" hint="Optional">
              <Input
                type="number"
                min={0}
                value={draft.minOrderAmount}
                onChange={(e) => setDraft({ ...draft, minOrderAmount: e.target.value })}
              />
            </Field>

            <Field label="Total redemptions" hint="Optional; blank means unlimited">
              <Input
                type="number"
                min={1}
                value={draft.usageLimit}
                onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })}
              />
            </Field>

            <Field label="Per customer" hint="Optional">
              <Input
                type="number"
                min={1}
                value={draft.perCustomerLimit}
                onChange={(e) => setDraft({ ...draft, perCustomerLimit: e.target.value })}
              />
            </Field>

            <Field label="Expires" hint="Optional">
              <Input
                type="date"
                value={draft.expiresAt}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
              />
            </Field>
          </FormGrid>

          <FormError error={save.error} />
        </Modal>
      )}
    </Page>
  );
}
