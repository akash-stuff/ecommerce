import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { Page, PrimaryButton } from '@/components/admin/Page';
import { Field, FormError, FormGrid, Input, Select, Textarea } from '@/components/admin/Modal';
import type { EditableTheme } from '@/types/api';

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero banner',
  featured: 'Featured products',
  categories: 'Category grid',
  newArrivals: 'New arrivals',
  newsletter: 'Newsletter signup',
};

interface Draft {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bodyFont: string;
  headingFont: string;
  logoUrl: string;
  faviconUrl: string;
  instagram: string;
  facebook: string;
  homepageLayout: string[];
  customCss: string;
}

export default function Appearance() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const theme = useQuery({
    queryKey: ['admin-theme'],
    queryFn: () => unwrap<EditableTheme>(apiClient.get('/theme')),
  });

  const options = useQuery({
    queryKey: ['theme-options'],
    queryFn: () =>
      unwrap<{ fonts: string[]; sections: string[] }>(apiClient.get('/theme/options')),
  });

  useEffect(() => {
    const t = theme.data?.theme;
    if (!t) return;
    setDraft({
      primaryColor: t.primaryColor,
      secondaryColor: t.secondaryColor,
      accentColor: t.accentColor,
      bodyFont: t.bodyFont,
      headingFont: t.headingFont,
      logoUrl: t.logoUrl ?? '',
      faviconUrl: t.faviconUrl ?? '',
      instagram: t.socialLinks?.instagram ?? '',
      facebook: t.socialLinks?.facebook ?? '',
      homepageLayout: t.homepageLayout ?? [],
      customCss: t.customCss ?? '',
    });
  }, [theme.data]);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      unwrap(
        apiClient.put('/theme', {
          primaryColor: d.primaryColor,
          secondaryColor: d.secondaryColor,
          accentColor: d.accentColor,
          bodyFont: d.bodyFont,
          headingFont: d.headingFont,
          logoUrl: d.logoUrl || undefined,
          faviconUrl: d.faviconUrl || undefined,
          socialLinks: { instagram: d.instagram, facebook: d.facebook },
          homepageLayout: d.homepageLayout,
          customCss: d.customCss,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-theme'] }),
  });

  if (theme.isLoading || !draft) {
    return <Page title="Appearance"><p className="text-sm text-ink-500">Loading…</p></Page>;
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });

  const toggleSection = (section: string) =>
    set(
      'homepageLayout',
      draft.homepageLayout.includes(section)
        ? draft.homepageLayout.filter((s) => s !== section)
        : [...draft.homepageLayout, section],
    );

  return (
    <Page
      title="Appearance"
      subtitle={`How ${theme.data?.name ?? 'your store'} looks to shoppers`}
      action={
        <PrimaryButton disabled={save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </PrimaryButton>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card title="Colours">
            <FormGrid>
              <ColourField
                label="Primary"
                hint="Buttons, links and headings"
                value={draft.primaryColor}
                onChange={(v) => set('primaryColor', v)}
              />
              <ColourField
                label="Secondary"
                hint="Supporting text and accents"
                value={draft.secondaryColor}
                onChange={(v) => set('secondaryColor', v)}
              />
              <ColourField
                label="Accent"
                value={draft.accentColor}
                onChange={(v) => set('accentColor', v)}
              />
            </FormGrid>
          </Card>

          <Card title="Type">
            <FormGrid>
              <Field label="Headings">
                <Select
                  value={draft.headingFont}
                  onChange={(e) => set('headingFont', e.target.value)}
                >
                  {(options.data?.fonts ?? [draft.headingFont]).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Body">
                <Select value={draft.bodyFont} onChange={(e) => set('bodyFont', e.target.value)}>
                  {(options.data?.fonts ?? [draft.bodyFont]).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </Select>
              </Field>
            </FormGrid>
            {/* The list is fixed because the storefront requests these by name
                from Google Fonts — a free-text value becomes a request URL. */}
            <p className="mt-3 text-xs text-ink-500">
              Fonts are loaded from Google Fonts, so only this list is available.
            </p>
          </Card>

          <Card title="Logo and icon">
            <FormGrid>
              <Field label="Logo URL" hint="Shown in the header instead of the store name" wide>
                <Input
                  value={draft.logoUrl}
                  placeholder="https://…"
                  onChange={(e) => set('logoUrl', e.target.value)}
                />
              </Field>
              <Field label="Favicon URL" wide>
                <Input
                  value={draft.faviconUrl}
                  placeholder="https://…"
                  onChange={(e) => set('faviconUrl', e.target.value)}
                />
              </Field>
            </FormGrid>
            <p className="mt-3 text-xs text-ink-500">
              Paste a URL for now — file upload needs object storage, which is not wired up yet.
            </p>
          </Card>

          <Card title="Social links">
            <FormGrid>
              <Field label="Instagram">
                <Input
                  value={draft.instagram}
                  placeholder="https://instagram.com/…"
                  onChange={(e) => set('instagram', e.target.value)}
                />
              </Field>
              <Field label="Facebook">
                <Input
                  value={draft.facebook}
                  placeholder="https://facebook.com/…"
                  onChange={(e) => set('facebook', e.target.value)}
                />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Homepage sections">
            <div className="space-y-2">
              {(options.data?.sections ?? []).map((section) => (
                <label key={section} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.homepageLayout.includes(section)}
                    onChange={() => toggleSection(section)}
                    className="h-4 w-4 rounded border-ink-300"
                  />
                  <span className="text-ink-900">{SECTION_LABELS[section] ?? section}</span>
                </label>
              ))}
            </div>
          </Card>

          <Card title="Custom CSS">
            <Textarea
              rows={10}
              spellCheck={false}
              value={draft.customCss}
              placeholder=".hero { padding: 64px 0; }"
              onChange={(e) => set('customCss', e.target.value)}
              // Monospace: this is code, and proportional type hides whitespace.
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
            <p className="mt-3 text-xs text-ink-500">
              Applies to your storefront only. Anything executable — <code>@import</code>,{' '}
              <code>expression()</code>, script tags, <code>javascript:</code> URLs — is refused,
              and comments are removed when saving.
            </p>
          </Card>

          <FormError error={save.error} />

          <div className="flex items-center gap-3">
            <PrimaryButton disabled={save.isPending} onClick={() => save.mutate(draft)}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
            {save.isSuccess && <span className="text-sm text-green-700">Saved</span>}
          </div>
        </div>

        <Preview draft={draft} storeName={theme.data?.name ?? 'Your store'} />
      </div>
    </Page>
  );
}

/**
 * A static approximation, not an iframe of the real storefront. It shows the
 * choices being made — colour, type, logo — without pretending to be the page
 * itself, which would need the storefront bundle and a live tenant host.
 */
function Preview({ draft, storeName }: { draft: Draft; storeName: string }) {
  return (
    <div className="lg:sticky lg:top-6 lg:self-start">
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-500">Preview</p>
      <div className="overflow-hidden rounded-card border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
          {draft.logoUrl ? (
            <img src={draft.logoUrl} alt="" className="h-6 w-auto" />
          ) : (
            <span
              style={{ color: draft.primaryColor, fontFamily: `'${draft.headingFont}', serif` }}
              className="text-sm font-semibold"
            >
              {storeName}
            </span>
          )}
          <span className="text-[10px] text-ink-300">Cart</span>
        </div>

        <div className="px-4 py-6" style={{ fontFamily: `'${draft.bodyFont}', sans-serif` }}>
          <h3
            style={{ fontFamily: `'${draft.headingFont}', serif` }}
            className="text-lg leading-tight text-ink-950"
          >
            {storeName}
          </h3>
          <p className="mt-1 text-xs" style={{ color: draft.secondaryColor }}>
            Supporting copy in the secondary colour.
          </p>
          <button
            style={{ backgroundColor: draft.primaryColor }}
            className="mt-4 rounded-card px-4 py-2 text-xs font-medium text-white"
          >
            Shop everything
          </button>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[0, 1].map((i) => (
              <div key={i}>
                <div className="aspect-square rounded bg-ink-50" />
                <p className="mt-1.5 text-[11px] text-ink-900">Product</p>
                <p className="text-[11px]" style={{ color: draft.accentColor }}>
                  ₹1,900.00
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-ink-500">
        An approximation. Custom CSS is not applied here — open your storefront to see it.
      </p>
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

function ColourField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour`}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-ink-300 bg-white p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-full rounded-card border border-ink-300 px-3 py-2 font-mono text-sm uppercase"
        />
      </div>
    </Field>
  );
}
