import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformService, type PlatformTemplate } from '@/services/platform.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero banner',
  featured: 'Featured products',
  categories: 'Category grid',
  newArrivals: 'New arrivals',
  newsletter: 'Newsletter signup',
};

interface Draft {
  id?: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  previewImage: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  sections: string[];
}

const blank: Draft = {
  name: '',
  slug: '',
  category: '',
  description: '',
  previewImage: '',
  primaryColor: '#111827',
  secondaryColor: '#6B7280',
  accentColor: '#111827',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  sections: ['hero', 'featured', 'categories', 'newArrivals', 'newsletter'],
};

export default function Templates() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const templates = useQuery({
    queryKey: ['platform-templates'],
    queryFn: platformService.templates,
  });

  const options = useQuery({
    queryKey: ['platform-template-options'],
    queryFn: platformService.templateOptions,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-templates'] });
    // The store-creation picker reads the gallery, which this may have changed.
    queryClient.invalidateQueries({ queryKey: ['platform-template-gallery'] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const payload = {
        name: d.name,
        category: d.category,
        description: d.description || undefined,
        previewImage: d.previewImage || undefined,
        defaultTheme: {
          primaryColor: d.primaryColor,
          secondaryColor: d.secondaryColor,
          accentColor: d.accentColor,
          headingFont: d.headingFont,
          bodyFont: d.bodyFont,
        },
        layoutConfig: { sections: d.sections },
      };
      return d.id
        ? platformService.updateTemplate(d.id, payload)
        : platformService.createTemplate({ ...payload, slug: d.slug || undefined });
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
    },
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      platformService.updateTemplate(id, { isActive }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => platformService.deleteTemplate(id),
    onSuccess: invalidate,
  });

  const edit = (t: PlatformTemplate) =>
    setDraft({
      id: t.id,
      name: t.name,
      slug: t.slug,
      category: t.category,
      description: t.description ?? '',
      previewImage: t.previewImage ?? '',
      primaryColor: t.defaultTheme?.primaryColor ?? blank.primaryColor,
      secondaryColor: t.defaultTheme?.secondaryColor ?? blank.secondaryColor,
      accentColor: t.defaultTheme?.accentColor ?? blank.accentColor,
      headingFont: t.defaultTheme?.headingFont ?? 'Inter',
      bodyFont: t.defaultTheme?.bodyFont ?? 'Inter',
      sections: t.layoutConfig?.sections ?? [],
    });

  const toggleSection = (section: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      sections: draft.sections.includes(section)
        ? draft.sections.filter((s) => s !== section)
        : [...draft.sections, section],
    });
  };

  const fonts = options.data?.fonts ?? ['Inter'];

  return (
    <Page
      title="Templates"
      subtitle="The starting points a new store can be built from"
      action={<PrimaryButton onClick={() => setDraft(blank)}>Add template</PrimaryButton>}
    >
      {templates.isLoading && <p className="text-sm text-ink-500">Loading…</p>}

      <FormError error={setActive.error ?? remove.error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.data?.map((t) => (
          <section
            key={t.id}
            className={`overflow-hidden rounded-card border border-ink-100 bg-white ${
              t.isActive ? '' : 'opacity-60'
            }`}
          >
            <Swatch theme={t.defaultTheme} previewImage={t.previewImage} name={t.name} />

            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-medium text-ink-950">{t.name}</h2>
                  <p className="mt-0.5 text-xs text-ink-500">{t.category}</p>
                </div>
                <StatusBadge value={t.isActive ? 'active' : 'retired'} />
              </div>

              {t.description && (
                <p className="mt-2 text-xs text-ink-500">{t.description}</p>
              )}

              <p className="mt-3 text-xs text-ink-500">
                {t._count.stores === 0
                  ? 'No stores built from it yet'
                  : `${t._count.stores} store${t._count.stores === 1 ? '' : 's'} built from it`}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => edit(t)} className="text-xs underline">
                  Edit
                </button>
                <button
                  onClick={() => setActive.mutate({ id: t.id, isActive: !t.isActive })}
                  disabled={setActive.isPending}
                  className="text-xs underline disabled:opacity-40"
                >
                  {t.isActive ? 'Retire' : 'Restore'}
                </button>
                {/* Offered only when nothing was built from it — the API refuses
                    the rest, and a button that always fails is worse than none. */}
                {t._count.stores === 0 && (
                  <button
                    onClick={() => remove.mutate(t.id)}
                    disabled={remove.isPending}
                    className="text-xs text-red-600 underline disabled:opacity-40"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      {templates.data?.length === 0 && (
        <div className="rounded-card border border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-sm text-ink-700">No templates yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Stores can still be created — they just start from platform defaults.
          </p>
        </div>
      )}

      {draft && (
        <Modal
          title={draft.id ? `Edit ${draft.name}` : 'Add template'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !draft.name || !draft.category}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field label="Category" hint="Apparel, grocery, electronics…">
              <Input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </Field>

            {!draft.id && (
              <Field label="Slug" hint="Derived from the name when left blank">
                <Input
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                />
              </Field>
            )}

            <Field label="Preview image URL" wide>
              <Input
                value={draft.previewImage}
                placeholder="https://…"
                onChange={(e) => setDraft({ ...draft, previewImage: e.target.value })}
              />
            </Field>

            <Field label="Description" wide>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>

            <Field label="Primary colour">
              <ColourInput
                value={draft.primaryColor}
                onChange={(v) => setDraft({ ...draft, primaryColor: v })}
              />
            </Field>

            <Field label="Secondary colour">
              <ColourInput
                value={draft.secondaryColor}
                onChange={(v) => setDraft({ ...draft, secondaryColor: v })}
              />
            </Field>

            <Field label="Accent colour">
              <ColourInput
                value={draft.accentColor}
                onChange={(v) => setDraft({ ...draft, accentColor: v })}
              />
            </Field>

            <Field label="Heading font">
              <Select
                value={draft.headingFont}
                onChange={(e) => setDraft({ ...draft, headingFont: e.target.value })}
              >
                {fonts.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
            </Field>

            <Field label="Body font">
              <Select
                value={draft.bodyFont}
                onChange={(e) => setDraft({ ...draft, bodyFont: e.target.value })}
              >
                {fonts.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </Select>
            </Field>
          </FormGrid>

          <fieldset className="mt-5">
            <legend className="text-sm text-ink-700">Homepage sections</legend>
            <div className="mt-2 space-y-2">
              {(options.data?.sections ?? []).map((section) => (
                <label key={section} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.sections.includes(section)}
                    onChange={() => toggleSection(section)}
                    className="h-4 w-4 rounded border-ink-300"
                  />
                  <span className="text-ink-900">{SECTION_LABELS[section] ?? section}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-4 text-xs text-ink-500">
            These are starting values. They are copied into a store's theme when it is
            created, so editing a template never changes a storefront that already exists.
          </p>

          <FormError error={save.error} />
        </Modal>
      )}
    </Page>
  );
}

/**
 * Shows the template as what it actually is — a set of colours and a typeface.
 * Falls back to the colours when there is no preview image, rather than a
 * broken-image box or an invented screenshot.
 */
function Swatch({
  theme,
  previewImage,
  name,
}: {
  theme: PlatformTemplate['defaultTheme'];
  previewImage: string | null;
  name: string;
}) {
  if (previewImage) {
    return (
      <img src={previewImage} alt="" className="h-28 w-full object-cover" />
    );
  }

  return (
    <div
      className="flex h-28 items-center justify-center"
      style={{ backgroundColor: theme?.primaryColor ?? '#111827' }}
    >
      <span
        className="text-lg text-white"
        style={{ fontFamily: `'${theme?.headingFont ?? 'Inter'}', serif` }}
      >
        {name}
      </span>
    </div>
  );
}

function ColourInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-ink-300 bg-white p-1"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full rounded-card border border-ink-300 px-3 py-2 font-mono text-sm uppercase"
      />
    </div>
  );
}
