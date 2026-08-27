import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryService } from '@/services/admin.service';
import { productService } from '@/services/store.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';
import type { InventoryTransaction } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

/** SALE and CANCELLATION are written by checkout, not chosen by a person. */
const MANUAL_REASONS = [
  { value: 'PURCHASE', label: 'Stock received' },
  { value: 'MANUAL_ADJUSTMENT', label: 'Manual correction' },
  { value: 'DAMAGE', label: 'Damaged or lost' },
  { value: 'RETURN', label: 'Customer return' },
];

export default function Inventory() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(false);
  const [productId, setProductId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('PURCHASE');
  const [note, setNote] = useState('');

  const ledger = useQuery({
    queryKey: ['admin-inventory', page],
    queryFn: () => inventoryService.history({ page, limit: 20 }),
    placeholderData: (previous) => previous,
  });

  // Loaded for the picker; a real catalogue would want a searchable field here.
  const products = useQuery({
    queryKey: ['admin-products-lite'],
    queryFn: () => productService.list({ limit: 100 }),
  });

  const adjust = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: () =>
      inventoryService.adjust({
        productId,
        quantityDelta: Number(delta),
        reason,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.saved('Stock adjusted');
      queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setAdjusting(false);
      setDelta('');
      setNote('');
    },
  });

  const columns: Column<InventoryTransaction>[] = [
    {
      header: 'When',
      cell: (t) => new Date(t.createdAt).toLocaleString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Product',
      cell: (t) => (
        <>
          <span className="text-ink-900">{t.product?.name ?? '—'}</span>
          {t.variant && <span className="text-ink-500"> · {t.variant.name}</span>}
          <span className="block font-mono text-xs text-ink-500">
            {t.variant?.sku ?? t.product?.sku}
          </span>
        </>
      ),
    },
    {
      header: 'Reason',
      cell: (t) => <span className="capitalize text-ink-700">{t.reason.toLowerCase().replace(/_/g, ' ')}</span>,
    },
    {
      header: 'Change',
      cell: (t) => (
        <span className={t.quantityDelta < 0 ? 'text-red-600' : 'text-green-700'}>
          {t.quantityDelta > 0 ? `+${t.quantityDelta}` : t.quantityDelta}
        </span>
      ),
      className: 'font-medium tabular-nums',
    },
    { header: 'Stock after', cell: (t) => t.stockAfter, className: 'tabular-nums text-ink-700' },
    {
      header: 'Reference',
      cell: (t) => (
        <span className="font-mono text-xs text-ink-500">{t.reference ?? t.note ?? '—'}</span>
      ),
    },
  ];

  return (
    <Page
      title="Inventory"
      subtitle="Every stock movement, and why it happened"
      action={<PrimaryButton onClick={() => setAdjusting(true)}>Adjust stock</PrimaryButton>}
    >
      <DataTable
        columns={columns}
        rows={ledger.data?.items}
        meta={ledger.data?.meta}
        isLoading={ledger.isLoading}
        isError={ledger.isError}
        onRetry={() => ledger.refetch()}
        onPage={setPage}
        emptyTitle="No stock movements yet"
        emptyHint="Sales and manual corrections both appear here."
        rowKey={(t) => t.id}
      />

      {adjusting && (
        <Modal
          title="Adjust stock"
          onClose={() => setAdjusting(false)}
          footer={
            <>
              <SecondaryButton onClick={() => setAdjusting(false)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={adjust.isPending || !productId || !delta || Number(delta) === 0}
                onClick={() => adjust.mutate()}
              >
                {adjust.isPending ? 'Saving…' : 'Apply'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Product" wide>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Choose a product</option>
                {products.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) · {p.stock} in stock
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Change"
              hint="Negative removes stock, positive adds it"
              error={
                Number(delta) === 0 && delta !== ''
                  ? 'A change of zero would record nothing'
                  : undefined
              }
            >
              <Input
                type="number"
                value={delta}
                placeholder="-3"
                onChange={(e) => setDelta(e.target.value)}
              />
            </Field>

            <Field label="Reason">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {MANUAL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Note" wide hint="Optional, kept on the ledger entry">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </FormGrid>

          <FormError error={adjust.error} />
        </Modal>
      )}
    </Page>
  );
}
