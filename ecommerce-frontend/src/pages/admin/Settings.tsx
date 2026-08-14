import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Select, Textarea } from '@/components/admin/Modal';
import type { EditableTheme } from '@/types/api';

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
    isPublished: false,
  });

  useEffect(() => {
    const s = store.data;
    if (!s) return;
    setDraft({
      name: s.name,
      description: s.description ?? '',
      metaTitle: s.metaTitle ?? '',
      metaDescription: s.metaDescription ?? '',
      isPublished: s.isPublished,
    });
  }, [store.data]);

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        apiClient.put('/theme/storefront', {
          name: draft.name,
          description: draft.description || undefined,
          metaTitle: draft.metaTitle || undefined,
          metaDescription: draft.metaDescription || undefined,
          isPublished: draft.isPublished,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-theme'] }),
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
          {save.isSuccess && <span className="text-sm text-green-700">Saved</span>}
        </div>

        <Domains />
      </div>
    </Page>
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
      unwrap<{ verified: boolean; pointsHere: boolean; message?: string }>(
        apiClient.post(`/domains/${id}/verify`, {}),
      ),
    onSuccess: (result) => {
      setVerifyResult(
        result.verified
          ? result.pointsHere
            ? 'Verified. HTTPS will be ready within a minute.'
            : 'Verified. Your DNS record still needs to point here before the site loads.'
          : (result.message ?? 'Not verified yet.'),
      );
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
