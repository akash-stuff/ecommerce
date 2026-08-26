import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LayoutTemplate } from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { themeService, type StoreTemplate } from '@/services/admin.service';
import { Card, Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { SECTION_LABELS, TemplatePreview } from '@/components/admin/TemplatePreview';
import { BACKGROUND_LABELS, surfaceFor } from '@/features/theme/backgrounds';
import type { EditableTheme } from '@/types/api';

interface Draft {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bodyFont: string;
  headingFont: string;
  logoUrl: string;
  faviconUrl: string;
  logoSize: string;
  background: string;
  backgroundImageUrl: string;
  backgroundFit: string;
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
      unwrap<{
        fonts: string[];
        sections: string[];
        backgrounds: string[];
        backgroundFits: string[];
        logoSizes: string[];
      }>(apiClient.get('/theme/options')),
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
      logoSize: t.logoSize ?? 'md',
      background: t.background ?? 'plain',
      backgroundImageUrl: t.backgroundImageUrl ?? '',
      backgroundFit: t.backgroundFit ?? 'cover',
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
          logoSize: d.logoSize,
          background: d.background,
          // Empty clears it; the API distinguishes that from an absent field.
          backgroundImageUrl: d.backgroundImageUrl,
          backgroundFit: d.backgroundFit,
          socialLinks: { instagram: d.instagram, facebook: d.facebook },
          homepageLayout: d.homepageLayout,
          customCss: d.customCss,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-theme'] }),
  });

  if (theme.isLoading || !draft) {
    return (
      <Page title="Appearance">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-card border border-ink-100 bg-white p-6">
                <div className="skeleton h-3 w-24" />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="skeleton h-9" />
                  <div className="skeleton h-9" />
                </div>
              </div>
            ))}
          </div>
          <div className="skeleton h-64" />
        </div>
        <span className="sr-only">Loading…</span>
      </Page>
    );
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

  const moveSection = (index: number, delta: number) => {
    const next = [...draft.homepageLayout];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set('homepageLayout', next);
  };

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
          <TemplateSection current={theme.data?.template ?? null} />

          <Card title="Colours" description="The three values every storefront surface derives from">
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
                hint="Prices and highlights"
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
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-ink-700">Logo</p>
                <p className="mb-2 mt-0.5 text-xs text-ink-500">
                  Shown in the header instead of the store name
                </p>
                <ImageUpload
                  label="logo"
                  purpose="theme"
                  aspect="wide"
                  value={draft.logoUrl}
                  onChange={(url) => set('logoUrl', url)}
                />

                {/* Offered because one fixed height cannot suit both a square
                    mark and a long wordmark — one of them always looks wrong. */}
                <div className="mt-4">
                  <p className="text-sm font-medium text-ink-700">Header size</p>
                  <div className="mt-1.5 flex gap-1 rounded-card border border-ink-100 bg-white p-1">
                    {(options.data?.logoSizes ?? ['sm', 'md', 'lg']).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => set('logoSize', size)}
                        className={`flex-1 rounded px-3 py-1 text-sm capitalize transition-colors ${
                          draft.logoSize === size
                            ? 'bg-ink-950 text-white'
                            : 'text-ink-700 hover:bg-ink-50'
                        }`}
                      >
                        {SIZE_LABELS[size] ?? size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-ink-700">Favicon</p>
                <p className="mb-2 mt-0.5 text-xs text-ink-500">
                  The small icon in a browser tab
                </p>
                <ImageUpload
                  label="favicon"
                  purpose="theme"
                  value={draft.faviconUrl}
                  onChange={(url) => set('faviconUrl', url)}
                />
              </div>
            </div>
          </Card>

          <Card
            title="Background"
            description="Drawn in your own colours, so it looks like your store rather than the platform"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(options.data?.backgrounds ?? []).map((preset) => (
                <BackgroundTile
                  key={preset}
                  preset={preset}
                  primary={draft.primaryColor}
                  secondary={draft.secondaryColor}
                  selected={!draft.backgroundImageUrl && draft.background === preset}
                  onSelect={() => {
                    // Choosing a preset clears a custom image, because the two
                    // are alternatives and an image always wins — leaving it set
                    // would make the click appear to do nothing.
                    setDraft({ ...draft, background: preset, backgroundImageUrl: '' });
                  }}
                />
              ))}
            </div>

            <div className="mt-6 border-t border-ink-100 pt-5">
              <p className="text-sm font-medium text-ink-700">Or use your own image</p>
              <p className="mb-2 mt-0.5 text-xs text-ink-500">
                Overrides the preset above. A photograph wants Fill; a seamless texture wants
                Tile.
              </p>
              <ImageUpload
                label="background"
                purpose="theme"
                aspect="wide"
                value={draft.backgroundImageUrl}
                onChange={(url) => set('backgroundImageUrl', url)}
              />

              {draft.backgroundImageUrl && (
                <div className="mt-3 flex gap-1 rounded-card border border-ink-100 bg-white p-1 sm:w-fit">
                  {(options.data?.backgroundFits ?? ['cover', 'tile']).map((fit) => (
                    <button
                      key={fit}
                      type="button"
                      onClick={() => set('backgroundFit', fit)}
                      className={`flex-1 rounded px-4 py-1 text-sm transition-colors sm:flex-none ${
                        draft.backgroundFit === fit
                          ? 'bg-ink-950 text-white'
                          : 'text-ink-700 hover:bg-ink-50'
                      }`}
                    >
                      {fit === 'cover' ? 'Fill' : 'Tile'}
                    </button>
                  ))}
                </div>
              )}
            </div>
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

          <Card
            title="Homepage sections"
            description="Ticked sections appear in this order, top to bottom"
          >
            <div className="space-y-1">
              {(options.data?.sections ?? []).map((section) => {
                const index = draft.homepageLayout.indexOf(section);
                const on = index !== -1;
                return (
                  <div
                    key={section}
                    className="flex items-center gap-3 rounded-card border border-ink-100 px-3 py-2"
                  >
                    <input
                      id={`layout-${section}`}
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSection(section)}
                      className="h-4 w-4 rounded border-ink-300"
                    />
                    <label
                      htmlFor={`layout-${section}`}
                      className={`flex-1 text-sm ${on ? 'text-ink-900' : 'text-ink-500'}`}
                    >
                      {SECTION_LABELS[section] ?? section}
                    </label>
                    {on && (
                      <span className="flex items-center gap-1">
                        <span className="numeric mr-1 text-xs text-ink-400">{index + 1}</span>
                        <button
                          type="button"
                          onClick={() => moveSection(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${SECTION_LABELS[section] ?? section} up`}
                          className="rounded border border-ink-200 px-1.5 text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSection(index, 1)}
                          disabled={index === draft.homepageLayout.length - 1}
                          aria-label={`Move ${SECTION_LABELS[section] ?? section} down`}
                          className="rounded border border-ink-200 px-1.5 text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
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
            {save.isSuccess && (
              <span className="flex items-center gap-1 text-sm text-green-700">
                <Check size={14} /> Saved
              </span>
            )}
          </div>
        </div>

        <Preview draft={draft} storeName={theme.data?.name ?? 'Your store'} />
      </div>
    </Page>
  );
}

/**
 * The template field.
 *
 * A store is created *from* a template and then diverges, so this shows which
 * one it started from and offers switching to another. Switching copies the new
 * template's colours, type and homepage sections over — it does not link the
 * store to the template, because a live storefront must never change because
 * someone edited a template in the platform console.
 */
function TemplateSection({ current }: { current: { id?: string; slug: string; name: string } | null }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<StoreTemplate | null>(null);
  const [keepLogo, setKeepLogo] = useState(true);
  const [keepCustomCss, setKeepCustomCss] = useState(true);

  const templates = useQuery({
    queryKey: ['admin-theme-templates'],
    queryFn: themeService.templates,
    // Only fetched once the picker is opened: the catalogue is irrelevant to
    // everyone who came here to change one colour.
    enabled: picking,
  });

  const apply = useMutation({
    mutationFn: (template: StoreTemplate) =>
      themeService.applyTemplate({ templateId: template.id, keepLogo, keepCustomCss }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-theme'] });
      // The storefront reads its own theme endpoint, so that cache is stale too.
      queryClient.invalidateQueries({ queryKey: ['store-config'] });
      setChosen(null);
      setPicking(false);
    },
  });

  return (
    <>
      <Card
        title="Template"
        description="The layout and palette this store started from"
        action={
          <SecondaryButton size="sm" onClick={() => setPicking(true)}>
            Change template
          </SecondaryButton>
        }
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-ink-50 text-ink-500">
            <LayoutTemplate size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm text-ink-950">{current?.name ?? 'No template'}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {current
                ? 'Your own edits since then are kept — this is only where the look began.'
                : 'This store was built from platform defaults rather than a template.'}
            </p>
          </div>
        </div>
      </Card>

      {picking && (
        <Modal
          title="Choose a template"
          description="Applies its colours, fonts and homepage sections to this store."
          width="lg"
          onClose={() => setPicking(false)}
          footer={<SecondaryButton onClick={() => setPicking(false)}>Close</SecondaryButton>}
        >
          {templates.isLoading && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-card border border-ink-100">
                  <div className="skeleton h-28 rounded-none" />
                  <div className="space-y-2 p-3">
                    <div className="skeleton h-3 w-1/2" />
                    <div className="skeleton h-3 w-2/3" />
                  </div>
                </div>
              ))}
              <span className="sr-only">Loading…</span>
            </div>
          )}

          <FormError error={templates.error} />

          <div className="grid gap-3 sm:grid-cols-2">
            {(templates.data ?? []).map((t) => {
              const isCurrent = current?.slug === t.slug;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setChosen(t)}
                  className="group overflow-hidden rounded-card border border-ink-100 bg-white text-left transition-shadow hover:shadow-raised"
                >
                  <div className="h-28 border-b border-ink-100">
                    <TemplatePreview
                      name={t.name}
                      theme={t.defaultTheme}
                      sections={t.layoutConfig?.sections}
                      previewImage={t.previewImage}
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink-950">{t.name}</p>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">
                          Current
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">
                        {t.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {!templates.isLoading && (templates.data?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-ink-500">
              No templates are available to switch to.
            </p>
          )}
        </Modal>
      )}

      {/* A second step, not a one-click apply. Switching overwrites colours,
          fonts and the homepage order in one go — worth confirming, and worth
          saying plainly what survives it. */}
      {chosen && (
        <Modal
          title={`Apply ${chosen.name}?`}
          onClose={() => setChosen(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setChosen(null)}>Cancel</SecondaryButton>
              <PrimaryButton disabled={apply.isPending} onClick={() => apply.mutate(chosen)}>
                {apply.isPending ? 'Applying…' : 'Apply template'}
              </PrimaryButton>
            </>
          }
        >
          <div className="h-40 overflow-hidden rounded-card border border-ink-100">
            <TemplatePreview
              name={chosen.name}
              theme={chosen.defaultTheme}
              sections={chosen.layoutConfig?.sections}
              previewImage={chosen.previewImage}
            />
          </div>

          <p className="mt-4 text-sm text-ink-700">
            This replaces your colours, fonts and homepage section order with this template's.
            Products, orders and pages are untouched.
          </p>

          <div className="mt-4 space-y-2 rounded-card bg-ink-50 p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={keepLogo}
                onChange={(e) => setKeepLogo(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300"
              />
              <span>
                <span className="text-ink-900">Keep my logo and favicon</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Templates do not carry a logo, so unticking this simply clears yours.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={keepCustomCss}
                onChange={(e) => setKeepCustomCss(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ink-300"
              />
              <span>
                <span className="text-ink-900">Keep my custom CSS</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  CSS written for the old layout may not fit the new one.
                </span>
              </span>
            </label>
          </div>

          <FormError error={apply.error} />
        </Modal>
      )}
    </>
  );
}

/**
 * A static approximation, not an iframe of the real storefront. It shows the
 * choices being made — colour, type, logo — without pretending to be the page
 * itself, which would need the storefront bundle and a live tenant host.
 */
function Preview({ draft, storeName }: { draft: Draft; storeName: string }) {
  return (
    <div className="lg:sticky lg:top-28 lg:self-start">
      <p className="mb-2 text-xs uppercase tracking-wide text-ink-500">Preview</p>
      <div
        className="overflow-hidden rounded-card border border-ink-100 shadow-card"
        /* The chosen background, behind the mock. Without it the preview shows
           a white page whatever was picked, and the setting looks broken. */
        style={{
          ...(draft.backgroundImageUrl
            ? {
                backgroundImage: `url(${JSON.stringify(draft.backgroundImageUrl)})`,
                backgroundSize: draft.backgroundFit === 'tile' ? 'auto' : 'cover',
                backgroundRepeat: draft.backgroundFit === 'tile' ? 'repeat' : 'no-repeat',
                backgroundPosition: 'center',
              }
            : { ...surfaceFor(draft.background, draft.primaryColor, draft.secondaryColor).style,
                backgroundAttachment: 'scroll' }),
        }}
      >
        <div className="flex items-center justify-between border-b border-ink-100 bg-white/80 px-4 py-3 backdrop-blur">
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
            type="button"
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
                <p className="numeric text-[11px]" style={{ color: draft.accentColor }}>
                  ₹1,900.00
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The homepage order, as a list, because the mock above only shows the
          top of the page and the order is edited further down the form. */}
      {draft.homepageLayout.length > 0 && (
        <ol className="mt-3 space-y-1">
          {draft.homepageLayout.map((section, i) => (
            <li key={section} className="flex items-center gap-2 text-xs text-ink-500">
              <span className="numeric w-3 text-right text-ink-400">{i + 1}</span>
              {SECTION_LABELS[section] ?? section}
            </li>
          ))}
        </ol>
      )}

      <p className="mt-3 text-xs text-ink-500">
        An approximation. Custom CSS is not applied here — open your storefront to see it.
      </p>
    </div>
  );
}

/** What the three logo heights are called where a shopkeeper picks one. */
const SIZE_LABELS: Record<string, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

/**
 * A background preset, rendered as itself.
 *
 * Swatches are drawn with the *live* draft colours rather than a fixed palette,
 * so the tile shows what this store will get. A preview in someone else's colours
 * would be a picture of a different shop.
 */
function BackgroundTile({
  preset,
  primary,
  secondary,
  selected,
  onSelect,
}: {
  preset: string;
  primary: string;
  secondary: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const surface = surfaceFor(preset, primary, secondary);
  const label = BACKGROUND_LABELS[preset] ?? { name: preset, hint: '' };

  return (
    <button
      type="button"
      onClick={onSelect}
      title={label.hint}
      aria-pressed={selected}
      className={`group overflow-hidden rounded-card border text-left transition-all ${
        selected
          ? 'border-ink-950 ring-1 ring-ink-950'
          : 'border-ink-200 hover:border-ink-300'
      }`}
    >
      <div
        className="relative flex h-20 items-end p-2"
        // The preset's own CSS. `backgroundAttachment: fixed` would anchor to
        // the viewport rather than this box, so it is dropped for the swatch.
        style={{ ...surface.style, backgroundAttachment: 'scroll' }}
      >
        {/* A miniature of what sits on the surface, so a dark preset visibly
            needs light type and a pale one does not. */}
        <span className="flex items-center gap-1.5">
          <span
            className="h-4 w-8 rounded-sm"
            style={{ backgroundColor: primary }}
          />
          <span
            className="h-1.5 w-6 rounded-full"
            style={{ backgroundColor: surface.dark ? 'rgba(255,255,255,.55)' : secondary }}
          />
        </span>
      </div>

      <div className="flex items-center justify-between gap-1 bg-white px-2.5 py-2">
        <span className="truncate text-xs font-medium text-ink-900">{label.name}</span>
        {selected && <Check size={12} className="shrink-0 text-ink-950" />}
      </div>
    </button>
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
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-ink-200 bg-white p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-full rounded-card border border-ink-200 px-3 py-2 font-mono text-sm uppercase transition-colors focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950"
        />
      </div>
    </Field>
  );
}
