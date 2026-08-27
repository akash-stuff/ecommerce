import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { shippingService } from '@/services/admin.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { Field, FormError, FormGrid, Input, Modal, Select } from '@/components/admin/Modal';
import { formatMoney } from '@/utils/format';
import type { ShippingZone } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

interface ZoneDraft {
  id?: string;
  name: string;
  countries: string;
  states: string;
  postalCodePrefixes: string;
}

interface MethodDraft {
  id?: string;
  zoneId: string;
  name: string;
  baseRate: string;
  perKgRate: string;
  freeAboveAmount: string;
  codAvailable: boolean;
  codFee: string;
  minDeliveryDays: string;
  maxDeliveryDays: string;
}

const csv = (v: string) =>
  v.split(',').map((s) => s.trim()).filter(Boolean);

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

export default function Shipping() {
  const queryClient = useQueryClient();
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft | null>(null);
  const [methodDraft, setMethodDraft] = useState<MethodDraft | null>(null);

  const zones = useQuery({ queryKey: ['admin-shipping'], queryFn: shippingService.zones });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-shipping'] });
    setZoneDraft(null);
    setMethodDraft(null);
  };

  const saveZone = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (d: ZoneDraft) => {
      const payload = {
        name: d.name,
        countries: csv(d.countries).map((c) => c.toUpperCase()),
        states: csv(d.states),
        postalCodePrefixes: csv(d.postalCodePrefixes),
      };
      return d.id ? shippingService.updateZone(d.id, payload) : shippingService.createZone(payload);
    },
    onSuccess: () => {
      toast.saved('Zone saved');
      refresh();
    },
  });

  const saveMethod = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (d: MethodDraft) => {
      const payload = {
        name: d.name,
        baseRate: Number(d.baseRate),
        perKgRate: num(d.perKgRate) ?? 0,
        freeAboveAmount: num(d.freeAboveAmount),
        codAvailable: d.codAvailable,
        codFee: num(d.codFee) ?? 0,
        minDeliveryDays: num(d.minDeliveryDays),
        maxDeliveryDays: num(d.maxDeliveryDays),
      };
      return d.id
        ? shippingService.updateMethod(d.id, payload)
        : shippingService.createMethod({ ...payload, zoneId: d.zoneId });
    },
    onSuccess: () => {
      toast.saved('Delivery method saved');
      refresh();
    },
  });

  const removeZone = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (id: string) => shippingService.removeZone(id),
    onSuccess: () => {
      toast.saved('Zone deleted');
      refresh();
    },
  });

  const removeMethod = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (id: string) => shippingService.removeMethod(id),
    onSuccess: () => {
      toast.saved('Delivery method deleted');
      refresh();
    },
  });

  const newMethod = (zoneId: string): MethodDraft => ({
    zoneId,
    name: '',
    baseRate: '',
    perKgRate: '',
    freeAboveAmount: '',
    codAvailable: false,
    codFee: '',
    minDeliveryDays: '',
    maxDeliveryDays: '',
  });

  return (
    <Page
      title="Shipping"
      subtitle="Where you deliver, and what it costs"
      action={
        <PrimaryButton
          onClick={() =>
            setZoneDraft({ name: '', countries: '', states: '', postalCodePrefixes: '' })
          }
        >
          Add zone
        </PrimaryButton>
      }
    >
      {zones.isLoading && <p className="text-sm text-ink-500">Loading…</p>}

      {zones.data?.length === 0 && (
        <div className="rounded-card border border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-sm text-ink-700">No delivery zones yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Until you add one, checkout has nothing to offer and customers cannot complete an order.
          </p>
        </div>
      )}

      <div className="space-y-5">
        {zones.data?.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            onEdit={() =>
              setZoneDraft({
                id: zone.id,
                name: zone.name,
                countries: zone.countries.join(', '),
                states: zone.states.join(', '),
                postalCodePrefixes: zone.postalCodePrefixes.join(', '),
              })
            }
            onDelete={() => removeZone.mutate(zone.id)}
            onAddMethod={() => setMethodDraft(newMethod(zone.id))}
            onEditMethod={(m) =>
              setMethodDraft({
                id: m.id,
                zoneId: zone.id,
                name: m.name,
                baseRate: String(Number(m.baseRate)),
                perKgRate: String(Number(m.perKgRate)),
                freeAboveAmount: m.freeAboveAmount ? String(Number(m.freeAboveAmount)) : '',
                codAvailable: m.codAvailable,
                codFee: String(Number(m.codFee)),
                minDeliveryDays: m.minDeliveryDays ? String(m.minDeliveryDays) : '',
                maxDeliveryDays: m.maxDeliveryDays ? String(m.maxDeliveryDays) : '',
              })
            }
            onRemoveMethod={(id) => removeMethod.mutate(id)}
          />
        ))}
      </div>

      <FormError error={removeZone.error ?? removeMethod.error} />

      {zoneDraft && (
        <Modal
          title={zoneDraft.id ? 'Edit zone' : 'Add zone'}
          onClose={() => setZoneDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setZoneDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={saveZone.isPending || !zoneDraft.name}
                onClick={() => saveZone.mutate(zoneDraft)}
              >
                {saveZone.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Zone name" wide hint="Only you see this — e.g. “India” or “Mumbai metro”">
              <Input
                value={zoneDraft.name}
                onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })}
              />
            </Field>

            <Field label="Countries" wide hint="Two-letter codes, comma separated. Blank means everywhere.">
              <Input
                value={zoneDraft.countries}
                placeholder="IN, LK"
                onChange={(e) => setZoneDraft({ ...zoneDraft, countries: e.target.value })}
              />
            </Field>

            <Field label="States" wide hint="Optional. Narrows the zone within those countries.">
              <Input
                value={zoneDraft.states}
                placeholder="Maharashtra, Gujarat"
                onChange={(e) => setZoneDraft({ ...zoneDraft, states: e.target.value })}
              />
            </Field>

            <Field
              label="Postal code prefixes"
              wide
              hint="Optional and most specific: a zone with these wins over one matching only the state."
            >
              <Input
                value={zoneDraft.postalCodePrefixes}
                placeholder="400, 401"
                onChange={(e) =>
                  setZoneDraft({ ...zoneDraft, postalCodePrefixes: e.target.value })
                }
              />
            </Field>
          </FormGrid>

          <FormError error={saveZone.error} />
        </Modal>
      )}

      {methodDraft && (
        <Modal
          title={methodDraft.id ? 'Edit method' : 'Add delivery method'}
          onClose={() => setMethodDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setMethodDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={saveMethod.isPending || !methodDraft.name || methodDraft.baseRate === ''}
                onClick={() => saveMethod.mutate(methodDraft)}
              >
                {saveMethod.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Name" hint="Shown at checkout">
              <Input
                value={methodDraft.name}
                placeholder="Standard"
                onChange={(e) => setMethodDraft({ ...methodDraft, name: e.target.value })}
              />
            </Field>

            <Field label="Base rate">
              <Input
                type="number"
                min={0}
                value={methodDraft.baseRate}
                onChange={(e) => setMethodDraft({ ...methodDraft, baseRate: e.target.value })}
              />
            </Field>

            <Field label="Per kg" hint="Added on top of the base rate">
              <Input
                type="number"
                min={0}
                value={methodDraft.perKgRate}
                onChange={(e) => setMethodDraft({ ...methodDraft, perKgRate: e.target.value })}
              />
            </Field>

            <Field label="Free above" hint="Optional. Judged after any discount.">
              <Input
                type="number"
                min={0}
                value={methodDraft.freeAboveAmount}
                onChange={(e) =>
                  setMethodDraft({ ...methodDraft, freeAboveAmount: e.target.value })
                }
              />
            </Field>

            <Field label="Cash on delivery">
              <Select
                value={methodDraft.codAvailable ? 'yes' : 'no'}
                onChange={(e) =>
                  setMethodDraft({ ...methodDraft, codAvailable: e.target.value === 'yes' })
                }
              >
                <option value="no">Not available</option>
                <option value="yes">Available</option>
              </Select>
            </Field>

            <Field label="COD handling fee">
              <Input
                type="number"
                min={0}
                disabled={!methodDraft.codAvailable}
                value={methodDraft.codFee}
                onChange={(e) => setMethodDraft({ ...methodDraft, codFee: e.target.value })}
              />
            </Field>

            <Field label="Fastest (days)">
              <Input
                type="number"
                min={0}
                value={methodDraft.minDeliveryDays}
                onChange={(e) =>
                  setMethodDraft({ ...methodDraft, minDeliveryDays: e.target.value })
                }
              />
            </Field>

            <Field label="Slowest (days)">
              <Input
                type="number"
                min={0}
                value={methodDraft.maxDeliveryDays}
                onChange={(e) =>
                  setMethodDraft({ ...methodDraft, maxDeliveryDays: e.target.value })
                }
              />
            </Field>
          </FormGrid>

          <FormError error={saveMethod.error} />
        </Modal>
      )}
    </Page>
  );
}

function ZoneCard({
  zone,
  onEdit,
  onDelete,
  onAddMethod,
  onEditMethod,
  onRemoveMethod,
}: {
  zone: ShippingZone;
  onEdit: () => void;
  onDelete: () => void;
  onAddMethod: () => void;
  onEditMethod: (m: ShippingZone['methods'][number]) => void;
  onRemoveMethod: (id: string) => void;
}) {
  const scope = [
    zone.postalCodePrefixes.length > 0 && `postcodes ${zone.postalCodePrefixes.join(', ')}`,
    zone.states.length > 0 && zone.states.join(', '),
    zone.countries.length > 0 ? zone.countries.join(', ') : 'everywhere',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="rounded-card border border-ink-100 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-medium text-ink-950">{zone.name}</h2>
          <p className="mt-0.5 text-xs text-ink-500">{scope}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAddMethod} className="text-xs underline">
            Add method
          </button>
          <button onClick={onEdit} className="text-xs underline">
            Edit zone
          </button>
          <button onClick={onDelete} aria-label={`Delete ${zone.name}`} className="rounded p-1 text-ink-500 hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      {zone.methods.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-500">
          No methods yet — this zone offers nothing at checkout.
        </p>
      ) : (
        <ul className="divide-y divide-ink-50">
          {zone.methods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className={m.isActive ? 'text-ink-900' : 'text-ink-500 line-through'}>
                {m.name}
              </span>
              <span className="text-ink-700">{formatMoney(m.baseRate)}</span>
              {Number(m.perKgRate) > 0 && (
                <span className="text-xs text-ink-500">+{formatMoney(m.perKgRate)}/kg</span>
              )}
              {m.freeAboveAmount && (
                <span className="text-xs text-ink-500">
                  free above {formatMoney(m.freeAboveAmount)}
                </span>
              )}
              {m.codAvailable && (
                <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs text-ink-700">
                  COD {Number(m.codFee) > 0 ? formatMoney(m.codFee) : 'free'}
                </span>
              )}
              {m.minDeliveryDays && m.maxDeliveryDays && (
                <span className="text-xs text-ink-500">
                  {m.minDeliveryDays}–{m.maxDeliveryDays} days
                </span>
              )}
              <span className="ml-auto flex gap-3">
                <button onClick={() => onEditMethod(m)} className="text-xs underline">
                  Edit
                </button>
                {m.isActive && (
                  <button
                    onClick={() => onRemoveMethod(m.id)}
                    className="text-xs text-red-600 underline"
                  >
                    Retire
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
