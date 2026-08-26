import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Check, Copy, CreditCard, Lock } from 'lucide-react';
import {
  paymentGatewayService,
  type GatewayCredentialField,
  type PaymentGateway,
} from '@/services/admin.service';
import { Card, DangerButton, Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { Field, FormError, Input, Modal } from '@/components/admin/Modal';
import { env } from '@/config/env';

const PROVIDER_COPY: Record<string, { title: string; blurb: string; icon: typeof CreditCard }> = {
  COD: {
    title: 'Cash on delivery',
    blurb: 'The shopper pays when the order arrives. You mark it collected from the order page.',
    icon: Banknote,
  },
  RAZORPAY: {
    title: 'Razorpay',
    blurb:
      'Cards, UPI, netbanking and wallets. Money settles into your own Razorpay account — enter the keys from your Razorpay dashboard.',
    icon: CreditCard,
  },
};

export default function Payments() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PaymentGateway | null>(null);

  const gateways = useQuery({
    queryKey: ['payment-gateways'],
    queryFn: paymentGatewayService.list,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-gateways'] });
  };

  const toggle = useMutation({
    mutationFn: ({ provider, isEnabled }: { provider: string; isEnabled: boolean }) =>
      paymentGatewayService.save(provider, { isEnabled }),
    onSuccess: invalidate,
  });

  const enabled = (gateways.data ?? []).filter((g) => g.ready);

  return (
    <Page
      title="Payments"
      subtitle="How this store takes money. Each method settles into your own account."
    >
      <FormError error={toggle.error} />

      {/* The one thing worth saying loudly: a store with nothing enabled has a
          checkout that cannot complete. */}
      {gateways.data && enabled.length === 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">No payment method is active</p>
            <p className="mt-0.5">
              Shoppers cannot complete checkout until at least one is switched on and fully set
              up. Cash on delivery needs nothing but the switch.
            </p>
          </div>
        </div>
      )}

      {gateways.isLoading && (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only">Loading…</span>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-card border border-ink-100 bg-white p-5">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton mt-3 h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      <FormError error={gateways.error} />

      <div className="space-y-4">
        {(gateways.data ?? []).map((gateway) => (
          <GatewayCard
            key={gateway.provider}
            gateway={gateway}
            busy={toggle.isPending}
            onToggle={(isEnabled) => toggle.mutate({ provider: gateway.provider, isEnabled })}
            onEdit={() => setEditing(gateway)}
          />
        ))}
      </div>

      {editing && (
        <CredentialsModal
          gateway={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </Page>
  );
}

function GatewayCard({
  gateway,
  busy,
  onToggle,
  onEdit,
}: {
  gateway: PaymentGateway;
  busy: boolean;
  onToggle: (isEnabled: boolean) => void;
  onEdit: () => void;
}) {
  const copy = PROVIDER_COPY[gateway.provider] ?? {
    title: gateway.provider,
    blurb: '',
    icon: CreditCard,
  };
  const Icon = copy.icon;

  const needsCredentials = gateway.credentialFields.length > 0;
  const missing = gateway.credentialFields.filter(
    (f) =>
      f.required &&
      (f.name === 'publicKey' ? !gateway.publicKey : !gateway.secretsSet.includes(f.name)),
  );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-ink-50 text-ink-500">
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-ink-950">{copy.title}</h2>
              {gateway.ready ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 ring-1 ring-inset ring-green-600/15">
                  <Check size={11} /> Active
                </span>
              ) : gateway.isEnabled ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/15">
                  Needs setup
                </span>
              ) : (
                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500 ring-1 ring-inset ring-ink-950/10">
                  Off
                </span>
              )}
            </div>
            <p className="mt-1 max-w-prose text-sm text-ink-500">{copy.blurb}</p>

            {gateway.publicKey && (
              <p className="mt-2 font-mono text-xs text-ink-600">{gateway.publicKey}</p>
            )}

            {/* Named, not just counted: "2 fields missing" makes someone open
                the form to find out which. */}
            {gateway.isEnabled && missing.length > 0 && (
              <p className="mt-2 text-xs text-amber-800">
                Still needed: {missing.map((f) => f.label).join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {needsCredentials && (
            <SecondaryButton size="sm" onClick={onEdit}>
              {gateway.secretsSet.length > 0 ? 'Edit keys' : 'Connect'}
            </SecondaryButton>
          )}
          <Toggle
            checked={gateway.isEnabled}
            disabled={busy}
            label={`${gateway.isEnabled ? 'Disable' : 'Enable'} ${copy.title}`}
            onChange={onToggle}
          />
        </div>
      </div>
    </Card>
  );
}

/**
 * The credentials form.
 *
 * Secret fields start blank even when a value is stored, because the API never
 * sends the value back. A blank field therefore means "leave it alone" — which
 * is why the hint says so rather than leaving the shopkeeper to guess whether an
 * empty box will wipe their key.
 */
function CredentialsModal({
  gateway,
  onClose,
  onSaved,
}: {
  gateway: PaymentGateway;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [publicKey, setPublicKey] = useState(gateway.publicKey ?? '');
  const [label, setLabel] = useState(gateway.label ?? '');
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      paymentGatewayService.save(gateway.provider, {
        publicKey,
        label,
        // Only fields actually typed into are sent, so an untouched secret keeps
        // its stored value instead of being cleared.
        secrets: Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== '')),
      }),
    onSuccess: onSaved,
  });

  const disconnect = useMutation({
    mutationFn: () => paymentGatewayService.disconnect(gateway.provider),
    onSuccess: onSaved,
  });

  const title = PROVIDER_COPY[gateway.provider]?.title ?? gateway.provider;

  if (confirmDisconnect) {
    return (
      <Modal
        title={`Disconnect ${title}?`}
        onClose={() => setConfirmDisconnect(false)}
        footer={
          <>
            <SecondaryButton onClick={() => setConfirmDisconnect(false)}>Keep it</SecondaryButton>
            <DangerButton disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
            </DangerButton>
          </>
        }
      >
        <p className="text-sm text-ink-700">
          The stored keys are deleted and this method stops being offered at checkout. Orders
          already paid through it keep their records. You will need the keys from your{' '}
          {title} dashboard again to reconnect.
        </p>
        <FormError error={disconnect.error} />
      </Modal>
    );
  }

  return (
    <Modal
      title={`${title} keys`}
      description="Stored encrypted. Nobody — including platform staff — can read them back."
      onClose={onClose}
      footer={
        <>
          {gateway.secretsSet.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              className="mr-auto rounded px-1 text-sm text-ink-500 transition-colors hover:text-red-600"
            >
              Disconnect
            </button>
          )}
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save keys'}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        {gateway.credentialFields.map((field) =>
          field.name === 'publicKey' ? (
            <Field key={field.name} label={field.label} hint={field.hint}>
              <Input
                value={publicKey}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setPublicKey(e.target.value)}
                className="font-mono"
              />
            </Field>
          ) : (
            <SecretField
              key={field.name}
              field={field}
              stored={gateway.secretsSet.includes(field.name)}
              value={secrets[field.name] ?? ''}
              onChange={(v) => setSecrets({ ...secrets, [field.name]: v })}
            />
          ),
        )}

        <Field label="Label" hint="Optional note for your own reference">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </div>

      {gateway.provider === 'RAZORPAY' && <WebhookHelp />}

      <FormError error={save.error} />
    </Modal>
  );
}

function SecretField({
  field,
  stored,
  value,
  onChange,
}: {
  field: GatewayCredentialField;
  stored: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="flex items-center gap-2">
        <span className="font-medium text-ink-700">{field.label}</span>
        {stored && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[11px] text-green-700">
            <Lock size={9} /> saved
          </span>
        )}
      </span>
      <Input
        type="password"
        value={value}
        spellCheck={false}
        autoComplete="new-password"
        placeholder={stored ? 'Leave blank to keep the saved key' : ''}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
      />
      {field.hint && <span className="mt-1 block text-xs text-ink-500">{field.hint}</span>}
    </label>
  );
}

/**
 * Razorpay will not tell us an outcome unless the store points a webhook at us.
 * Without one, a shopper pays and the order sits unpaid — so the URL is put
 * where the keys are entered rather than in documentation nobody opens.
 */
function WebhookHelp() {
  const [copied, setCopied] = useState(false);
  const url = `${env.apiUrl.replace(/\/+$/, '')}/payments/webhook/razorpay`;

  return (
    <div className="mt-5 rounded-card border border-ink-100 bg-ink-50 p-4">
      <p className="text-sm font-medium text-ink-900">One more step in Razorpay</p>
      <p className="mt-1 text-sm text-ink-600">
        Add this webhook URL under Settings → Webhooks, subscribe it to{' '}
        <code className="text-xs">payment.captured</code> and{' '}
        <code className="text-xs">payment.failed</code>, and paste the same webhook secret you
        entered above. Without it a shopper can pay and the order will still show as unpaid.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-ink-200 bg-white px-2 py-1.5 text-xs text-ink-800">
          {url}
        </code>
        <SecondaryButton
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </SecondaryButton>
      </div>
    </div>
  );
}

/** A switch, because "enabled" is a state rather than an action. */
function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-ink-950' : 'bg-ink-200'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform ${
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
