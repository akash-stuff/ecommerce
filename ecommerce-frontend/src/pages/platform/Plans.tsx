import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformService, type PlatformPlan } from '@/services/platform.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select } from '@/components/admin/Modal';
import { formatMoney } from '@/utils/format';
import { toast, toastFromError } from '@/components/Toasts';

interface Draft {
  id?: string;
  name: string;
  priceMonthly: string;
  priceYearly: string;
  maxProducts: string;
  maxStaff: string;
  maxOrdersMonth: string;
  customDomain: boolean;
}

const blank: Draft = {
  name: '',
  priceMonthly: '',
  priceYearly: '',
  maxProducts: '',
  maxStaff: '',
  maxOrdersMonth: '',
  customDomain: false,
};

/** Blank means unlimited, which is not the same as zero. */
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const limit = (v: number | null) => (v === null ? 'Unlimited' : String(v));

export default function Plans() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const plans = useQuery({ queryKey: ['platform-plans'], queryFn: platformService.plans });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
    setDraft(null);
  };

  const save = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (d: Draft) => {
      const payload = {
        priceMonthly: Number(d.priceMonthly),
        priceYearly: Number(d.priceYearly),
        maxProducts: num(d.maxProducts),
        maxStaff: num(d.maxStaff),
        maxOrdersMonth: num(d.maxOrdersMonth),
        customDomain: d.customDomain,
      };
      return d.id
        ? platformService.updatePlan(d.id, payload)
        : platformService.createPlan({ ...payload, name: d.name });
    },
    onSuccess: () => {
      toast.saved('Plan saved');
      refresh();
    },
  });

  const retire = useMutation({
    mutationFn: (id: string) => platformService.retirePlan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-plans'] }),
  });

  const edit = (p: PlatformPlan) =>
    setDraft({
      id: p.id,
      name: p.name,
      priceMonthly: String(Number(p.priceMonthly)),
      priceYearly: String(Number(p.priceYearly)),
      maxProducts: p.maxProducts === null ? '' : String(p.maxProducts),
      maxStaff: p.maxStaff === null ? '' : String(p.maxStaff),
      maxOrdersMonth: p.maxOrdersMonth === null ? '' : String(p.maxOrdersMonth),
      customDomain: p.customDomain,
    });

  return (
    <Page
      title="Plans"
      subtitle="What you charge, and the limits each plan carries"
      action={<PrimaryButton onClick={() => setDraft(blank)}>Add plan</PrimaryButton>}
    >
      {plans.isLoading && <p className="text-sm text-ink-500">Loading…</p>}

      <FormError error={retire.error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.data?.map((p) => (
          <section key={p.id} className="rounded-card border border-ink-100 bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium text-ink-950">{p.name}</h2>
                <p className="mt-1 text-2xl font-medium tracking-tight text-ink-950">
                  {formatMoney(p.priceMonthly, p.currency)}
                  <span className="text-sm font-normal text-ink-500">/mo</span>
                </p>
                <p className="text-xs text-ink-500">
                  {formatMoney(p.priceYearly, p.currency)} yearly
                </p>
              </div>
              <StatusBadge value={p.isActive ? 'active' : 'archived'} />
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Products" value={limit(p.maxProducts)} />
              <Row label="Staff" value={limit(p.maxStaff)} />
              <Row label="Orders per month" value={limit(p.maxOrdersMonth)} />
              <Row label="Custom domain" value={p.customDomain ? 'Included' : 'No'} />
              <Row label="Stores on it" value={String(p._count.subscriptions)} />
            </dl>

            <div className="mt-4 flex gap-3">
              <button onClick={() => edit(p)} className="text-xs underline">
                Edit
              </button>
              {p.isActive && (
                <button
                  onClick={() => retire.mutate(p.id)}
                  disabled={retire.isPending}
                  className="text-xs text-red-600 underline disabled:opacity-40"
                >
                  Retire
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      {plans.data?.length === 0 && (
        <div className="rounded-card border border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-sm text-ink-700">No plans yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Stores can exist without one, but you cannot bill them.
          </p>
        </div>
      )}

      {draft && (
        <Modal
          title={draft.id ? `Edit ${draft.name}` : 'Add plan'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !draft.name || draft.priceMonthly === ''}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Name" hint={draft.id ? 'The name cannot be changed' : undefined}>
              <Input
                value={draft.name}
                disabled={Boolean(draft.id)}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field label="Custom domain">
              <Select
                value={draft.customDomain ? 'yes' : 'no'}
                onChange={(e) => setDraft({ ...draft, customDomain: e.target.value === 'yes' })}
              >
                <option value="no">Not included</option>
                <option value="yes">Included</option>
              </Select>
            </Field>

            <Field label="Monthly price">
              <Input
                type="number"
                min={0}
                value={draft.priceMonthly}
                onChange={(e) => setDraft({ ...draft, priceMonthly: e.target.value })}
              />
            </Field>

            <Field label="Yearly price">
              <Input
                type="number"
                min={0}
                value={draft.priceYearly}
                onChange={(e) => setDraft({ ...draft, priceYearly: e.target.value })}
              />
            </Field>

            <Field label="Max products" hint="Blank for unlimited">
              <Input
                type="number"
                min={1}
                value={draft.maxProducts}
                onChange={(e) => setDraft({ ...draft, maxProducts: e.target.value })}
              />
            </Field>

            <Field label="Max staff" hint="Blank for unlimited">
              <Input
                type="number"
                min={1}
                value={draft.maxStaff}
                onChange={(e) => setDraft({ ...draft, maxStaff: e.target.value })}
              />
            </Field>

            <Field label="Max orders per month" hint="Blank for unlimited">
              <Input
                type="number"
                min={1}
                value={draft.maxOrdersMonth}
                onChange={(e) => setDraft({ ...draft, maxOrdersMonth: e.target.value })}
              />
            </Field>
          </FormGrid>

          <FormError error={save.error} />
        </Modal>
      )}
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}
