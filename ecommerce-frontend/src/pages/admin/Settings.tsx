import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { invoiceService, type InvoiceSettings } from '@/services/admin.service';
import {
  domainStatusMessage,
  type DomainVerifyResult,
} from '@/features/domains/status-message';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Select, Textarea } from '@/components/admin/Modal';
import type { EditableTheme } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

interface DomainRow {
  id: string;
  hostname: string;
  status: 'PENDING' | 'VERIFYING' | 'ACTIVE' | 'FAILED';
  isPrimary: boolean;
  isPlatform: boolean;
  verifiedAt: string | null;
  sslIssuedAt: string | null;
}

interface Instructions {
  hostname: string;
  txtName: string;
  txtValue: string;
  pointTo: string;
  recordType: 'CNAME' | 'A';
}

export default function Settings() {
  const queryClient = useQueryClient();

  const store = useQuery({
    queryKey: ['admin-theme'],
    queryFn: () => unwrap<EditableTheme>(apiClient.get('/theme')),
  });

  const [draft, setDraft] = useState({
    name: '',
    description: '',
    metaTitle: '',
    metaDescription: '',
    productDescription: '',
    isPublished: false,
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
  });

  useEffect(() => {
    const s = store.data;
    if (!s) return;
    setDraft({
      name: s.name,
      description: s.description ?? '',
      metaTitle: s.metaTitle ?? '',
      metaDescription: s.metaDescription ?? '',
      productDescription: s.productDescription ?? '',
      isPublished: s.isPublished,
      email: s.email,
      phone: s.phone ?? '',
      addressLine1: s.addressLine1 ?? '',
      addressLine2: s.addressLine2 ?? '',
      city: s.city ?? '',
      state: s.state ?? '',
      postalCode: s.postalCode ?? '',
    });
  }, [store.data]);

  const save = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: () =>
      unwrap(
        apiClient.put('/theme/storefront', {
          name: draft.name,
          description: draft.description || undefined,
          metaTitle: draft.metaTitle || undefined,
          metaDescription: draft.metaDescription || undefined,
          /**
           * Sent raw, empty included. The API reads an absent field as "not
           * editing this", so `|| undefined` would make clearing this block
           * impossible — the save would succeed and every product page would
           * keep showing it.
           */
          productDescription: draft.productDescription,
          isPublished: draft.isPublished,
          /**
           * The contact block, sent raw for the same reason: emptying the phone
           * or a line of the address is how a shop removes it, and `|| undefined`
           * would make a cleared field impossible to save. The email is the one
           * that cannot be emptied — the API refuses a blank one, because the
           * storefront footer and every order email print it.
           */
          email: draft.email,
          phone: draft.phone,
          addressLine1: draft.addressLine1,
          addressLine2: draft.addressLine2,
          city: draft.city,
          state: draft.state,
          postalCode: draft.postalCode,
        }),
      ),
    onSuccess: () => {
      toast.saved('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-theme'] });
    },
  });

  if (store.isLoading) {
    return <Page title="Settings"><p className="text-sm text-ink-500">Loading…</p></Page>;
  }

  return (
    <Page title="Settings" subtitle="Store details, visibility and domains">
      <div className="max-w-2xl space-y-6">
        <Card title="Store details">
          <FormGrid>
            <Field label="Store name" wide hint="Shown in the header, emails and page titles">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Description" wide>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
          </FormGrid>
        </Card>

        {/* Where a customer writes when something goes wrong. Its own card
            rather than more fields under "Store details", because these are
            printed in three places a shopkeeper can point at — the footer of
            every storefront page, the foot of every order email, and the top of
            an invoice — and the hints say so. */}
        <Card title="Contact details">
          <p className="-mt-2 mb-4 text-sm text-ink-500">
            Shown in your storefront footer, at the foot of every email you send, and on
            invoices unless you override them under Invoicing below.
          </p>

          <FormGrid>
            <Field
              label="Contact email"
              hint="Where shoppers reply. Cannot be empty — it is printed on every order email."
            >
              <Input
                type="email"
                autoComplete="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>

            <Field label="Mobile number" hint="Optional. Empty removes it everywhere.">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="+91 98400 11111"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </Field>

            <Field label="Address" wide hint="Your trading address, used on invoices">
              <Input
                value={draft.addressLine1}
                placeholder="Line 1"
                onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
              />
            </Field>

            <Field label="Address line 2" wide>
              <Input
                value={draft.addressLine2}
                onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })}
              />
            </Field>

            <Field label="City">
              <Input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </Field>

            <Field label="State">
              <Input
                value={draft.state}
                onChange={(e) => setDraft({ ...draft, state: e.target.value })}
              />
            </Field>

            <Field label="Postcode">
              <Input
                value={draft.postalCode}
                maxLength={12}
                onChange={(e) => setDraft({ ...draft, postalCode: e.target.value })}
              />
            </Field>
          </FormGrid>
        </Card>

        <Card title="Search engines">
          <FormGrid>
            <Field
              label="Page title"
              wide
              hint="Falls back to the store name. Around 60 characters shows fully in results."
            >
              <Input
                value={draft.metaTitle}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, metaTitle: e.target.value })}
              />
            </Field>
            <Field label="Meta description" wide hint="Roughly 155 characters">
              <Textarea
                rows={2}
                maxLength={300}
                value={draft.metaDescription}
                onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
              />
            </Field>
          </FormGrid>
        </Card>

        <Card title="Product pages">
          <Field
            label="Shown under every product"
            hint={`${draft.productDescription.length}/2000 · delivery, returns, care — written once, shown below each product's own description`}
          >
            <Textarea
              rows={4}
              maxLength={2000}
              value={draft.productDescription}
              placeholder={
                'Free delivery on orders over ₹999.\nReturns accepted within 7 days, unused and in original packaging.'
              }
              onChange={(e) => setDraft({ ...draft, productDescription: e.target.value })}
            />
          </Field>
          <p className="mt-2 text-xs text-ink-500">
            Plain text — it is rendered as words, never as markup. Leave it empty and nothing
            extra appears.
          </p>
        </Card>

        <Card title="Visibility">
          <Field
            label="Storefront"
            hint={
              draft.isPublished
                ? 'Anyone with the address can shop here.'
                : 'Your storefront returns "no store at this address" to visitors.'
            }
          >
            <Select
              value={draft.isPublished ? 'yes' : 'no'}
              onChange={(e) => setDraft({ ...draft, isPublished: e.target.value === 'yes' })}
            >
              <option value="yes">Published</option>
              <option value="no">Hidden</option>
            </Select>
          </Field>
        </Card>

        <FormError error={save.error} />

        <div className="flex items-center gap-3">
          <PrimaryButton disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
        </div>

        <Invoicing />

        <Domains />
      </div>
    </Page>
  );
}

/**
 * The details printed on every invoice a shopper downloads.
 *
 * Its own section with its own save, not folded into the store form above:
 * these are the shop's *legal* identity — registered name, GSTIN, registered
 * address — and they are edited on their own occasion, usually once, often by
 * someone reading them off a certificate.
 *
 * Nothing here is required. Every field falls back to the store's trading
 * details, and the panel says what an invoice would print today so a shop that
 * has filled in none of it can see that its invoices already work.
 */
function Invoicing() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  const settings = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: invoiceService.settings,
  });

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setDraft({
      businessName: s.businessName ?? '',
      gstin: s.gstin ?? '',
      pan: s.pan ?? '',
      addressLine1: s.addressLine1 ?? '',
      addressLine2: s.addressLine2 ?? '',
      city: s.city ?? '',
      state: s.state ?? '',
      postalCode: s.postalCode ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      prefix: s.prefix ?? 'INV-',
      notes: s.notes ?? '',
    });
  }, [settings.data]);

  const save = useMutation({
    onError: (e) => toastFromError(e),
    // Sent whole, blanks included: an emptied field is how an override is
    // removed and the store's own detail restored.
    mutationFn: (d: Record<string, string>) => invoiceService.saveSettings(d),
    onSuccess: (updated: InvoiceSettings) => {
      toast.saved('Invoicing saved');
      queryClient.setQueryData(['invoice-settings'], updated);
    },
  });

  if (!draft) {
    return (
      <Card title="Invoicing">
        <p className="text-sm text-ink-500">Loading…</p>
      </Card>
    );
  }

  const set = (key: string, value: string) => setDraft({ ...draft, [key]: value });
  const effective = settings.data?.effective;

  return (
    <Card title="Invoicing">
      <p className="-mt-2 mb-4 text-sm text-ink-500">
        Printed on the invoice shoppers download after buying. Leave a field empty and your
        store's own details are used instead.
      </p>

      <FormGrid>
        <Field
          label="Registered business name"
          wide
          hint="Only if it differs from your store name"
        >
          <Input
            value={draft.businessName}
            placeholder={effective?.name}
            onChange={(e) => set('businessName', e.target.value)}
          />
        </Field>

        <Field
          label="GSTIN"
          hint="15 characters, e.g. 27AAPFU0939F1ZV. Leave empty if you are not registered."
        >
          <Input
            value={draft.gstin}
            spellCheck={false}
            maxLength={15}
            className="font-mono uppercase"
            // Upper-cased as it is typed: a GSTIN is defined in upper case and
            // the server stores it that way, so showing it lower here would be
            // a value that silently changes on save.
            onChange={(e) => set('gstin', e.target.value.toUpperCase())}
          />
        </Field>

        <Field label="PAN" hint="10 characters. Optional.">
          <Input
            value={draft.pan}
            spellCheck={false}
            maxLength={10}
            className="font-mono uppercase"
            onChange={(e) => set('pan', e.target.value.toUpperCase())}
          />
        </Field>

        <Field label="Address" wide>
          <Input
            value={draft.addressLine1}
            placeholder="Registered address, line 1"
            onChange={(e) => set('addressLine1', e.target.value)}
          />
        </Field>

        <Field label="Address line 2" wide>
          <Input
            value={draft.addressLine2}
            onChange={(e) => set('addressLine2', e.target.value)}
          />
        </Field>

        <Field label="City">
          <Input value={draft.city} onChange={(e) => set('city', e.target.value)} />
        </Field>

        <Field
          label="State"
          hint="Decides whether an order is taxed as CGST + SGST or as IGST"
        >
          <Input value={draft.state} onChange={(e) => set('state', e.target.value)} />
        </Field>

        <Field label="Postcode">
          <Input
            value={draft.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
          />
        </Field>

        <Field label="Invoice number prefix" hint={`Invoices read ${draft.prefix}ORD-1042`}>
          <Input
            value={draft.prefix}
            maxLength={12}
            className="font-mono"
            onChange={(e) => set('prefix', e.target.value)}
          />
        </Field>

        <Field
          label="Billing email"
          hint="Empty uses your contact email above"
        >
          <Input
            type="email"
            autoComplete="off"
            value={draft.email}
            placeholder={effective?.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <Field label="Billing mobile" hint="Empty uses your contact number above">
          <Input
            type="tel"
            inputMode="tel"
            maxLength={20}
            value={draft.phone}
            placeholder={effective?.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>

        <Field
          label="Notes"
          wide
          hint="Terms, bank details, a thank-you — printed at the foot of every invoice"
        >
          <Textarea
            rows={3}
            maxLength={1000}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </FormGrid>

      {/* What an invoice prints today, fallbacks applied. Without this a shop
          that has filled in nothing sees an empty form and reasonably concludes
          its invoices are broken. */}
      {effective && (
        <div className="mt-5 rounded-card border border-ink-100 bg-ink-50/60 p-4">
          <p className="text-xs uppercase tracking-wide text-ink-500">
            Your invoices currently say
          </p>
          <p className="mt-2 text-sm font-medium text-ink-950">{effective.name}</p>
          {effective.lines.map((line) => (
            <p key={line} className="text-sm text-ink-700">{line}</p>
          ))}
          {effective.gstin ? (
            <p className="mt-1 font-mono text-xs text-ink-950">GSTIN {effective.gstin}</p>
          ) : (
            <p className="mt-1 text-xs text-ink-500">
              No GSTIN — tax is printed as a single line rather than split into CGST and SGST.
            </p>
          )}

          {/* The contact line, which the invoice prints under the address. It
              was missing here, so an admin who typed a billing email had no way
              to tell whether it had taken — the panel showed the same three
              lines before and after the save. */}
          {effective.email || effective.phone ? (
            <p className="mt-1 text-sm text-ink-700">
              {[effective.email, effective.phone].filter(Boolean).join('  ·  ')}
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-500">
              No contact details — your invoices print no email or phone number.
            </p>
          )}
        </div>
      )}

      <FormError error={save.error} />

      <div className="mt-5">
        <PrimaryButton disabled={save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? 'Saving…' : 'Save invoicing details'}
        </PrimaryButton>
      </div>
    </Card>
  );
}

/**
 * Connecting a domain is a three-step conversation with DNS, so the UI shows
 * exactly which step failed rather than a single "not verified" — DNS problems
 * are otherwise almost impossible for a shop owner to diagnose.
 */
function Domains() {
  const queryClient = useQueryClient();
  const [hostname, setHostname] = useState('');
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const domains = useQuery({
    queryKey: ['admin-domains'],
    queryFn: () => unwrap<DomainRow[]>(apiClient.get('/domains')),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-domains'] });

  const add = useMutation({
    mutationFn: () =>
      unwrap<{ id: string; instructions: Instructions }>(
        apiClient.post('/domains', { hostname: hostname.trim() }),
      ),
    onSuccess: (result) => {
      setInstructions(result.instructions);
      setHostname('');
      refresh();
    },
  });

  const verify = useMutation({
    mutationFn: (id: string) =>
      unwrap<DomainVerifyResult>(apiClient.post(`/domains/${id}/verify`, {})),
    onSuccess: (result) => {
      setVerifyResult(domainStatusMessage(result));
      refresh();
    },
  });

  const setPrimary = useMutation({
    mutationFn: (id: string) => unwrap(apiClient.patch(`/domains/${id}/primary`, {})),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/domains/${id}`),
    onSuccess: () => {
      setInstructions(null);
      refresh();
    },
  });

  return (
    <Card title="Domains">
      <ul className="divide-y divide-ink-50">
        {domains.data?.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <span className="text-ink-900">{d.hostname}</span>
            <StatusBadge value={d.status} />
            {d.isPrimary && (
              <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs text-ink-700">
                Primary
              </span>
            )}
            {d.isPlatform && <span className="text-xs text-ink-500">Provided by us</span>}

            <span className="ml-auto flex items-center gap-3">
              {d.status !== 'ACTIVE' && !d.isPlatform && (
                <button
                  onClick={() => verify.mutate(d.id)}
                  disabled={verify.isPending}
                  className="flex items-center gap-1 text-xs underline"
                >
                  <RefreshCw size={12} /> Verify
                </button>
              )}
              {d.status === 'ACTIVE' && !d.isPrimary && (
                <button onClick={() => setPrimary.mutate(d.id)} className="text-xs underline">
                  Make primary
                </button>
              )}
              {!d.isPlatform && (
                <button
                  onClick={() => remove.mutate(d.id)}
                  aria-label={`Remove ${d.hostname}`}
                  className="rounded p-1 text-ink-500 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {verifyResult && (
        <p className="mt-3 rounded-card bg-ink-50 px-3 py-2 text-sm text-ink-700">{verifyResult}</p>
      )}

      <div className="mt-5 flex gap-2">
        <Input
          value={hostname}
          placeholder="shop.yourdomain.com"
          onChange={(e) => setHostname(e.target.value)}
        />
        <SecondaryButton disabled={add.isPending || !hostname.trim()} onClick={() => add.mutate()}>
          {add.isPending ? 'Adding…' : 'Add domain'}
        </SecondaryButton>
      </div>

      <FormError error={add.error ?? verify.error ?? setPrimary.error ?? remove.error} />

      {instructions && (
        <div className="mt-5 rounded-card border border-ink-200 bg-ink-50 p-4">
          <p className="text-sm font-medium text-ink-950">
            Add these two records at your DNS provider
          </p>
          <p className="mt-1 text-xs text-ink-500">
            The first proves you own the domain. The second sends visitors here.
          </p>

          <div className="mt-4 space-y-3">
            <Record label="TXT" name={instructions.txtName} value={instructions.txtValue} />
            <Record
              label={instructions.recordType}
              name={instructions.hostname}
              value={instructions.pointTo}
            />
          </div>

          <p className="mt-4 text-xs text-ink-500">
            DNS changes can take up to an hour. Click <strong>Verify</strong> once they are live.
          </p>
        </div>
      )}
    </Card>
  );
}

function Record({ label, name, value }: { label: string; name: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded border border-ink-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-700">
          {label}
        </span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy value'}
        </button>
      </div>
      <p className="mt-2 break-all font-mono text-xs text-ink-500">{name}</p>
      <p className="mt-1 break-all font-mono text-xs text-ink-950">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-ink-100 bg-white p-6">
      <h2 className="text-sm font-medium text-ink-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
