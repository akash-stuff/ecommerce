import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate, Store } from 'lucide-react';
import { platformService, type PlatformTemplate } from '@/services/platform.service';
import { EmptyState, Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { SECTION_LABELS, TemplatePreview } from '@/components/admin/TemplatePreview';
import { BACKGROUND_LABELS } from '@/features/theme/backgrounds';

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
  background: string;
  logoSize: string;
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
  background: 'plain',
  logoSize: 'md',
  sections: ['hero', 'featured', 'categories', 'newArrivals', 'newsletter'],
};

type Filter = 'all' | 'active' | 'retired';

export default function Templates() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlatformTemplate | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

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
    // So does the tenant admin's own picker, on a different key.
    queryClient.invalidateQueries({ queryKey: ['admin-theme-templates'] });
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
          background: d.background,
          logoSize: d.logoSize,
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
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
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
      background: t.defaultTheme?.background ?? 'plain',
      logoSize: t.defaultTheme?.logoSize ?? 'md',
      sections: t.layoutConfig?.sections ?? [],
    });

  const toggleSection = (section: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      sections: draft.sections.includes(section)
        ? draft.sections.filter((s) => s !== section)
        : // Appended rather than inserted in canonical order: the array *is* the
          // homepage order, so where a section is added is a real decision.
          [...draft.sections, section],
    });
  };

  const move = (index: number, delta: number) => {
    if (!draft) return;
    const next = [...draft.sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, sections: next });
  };

  const fonts = options.data?.fonts ?? ['Inter'];
  const all = templates.data ?? [];

  const shown = useMemo(
    () =>
      all.filter((t) =>
        filter === 'all' ? true : filter === 'active' ? t.isActive : !t.isActive,
      ),
    [all, filter],
  );

  const counts = {
    all: all.length,
    active: all.filter((t) => t.isActive).length,
    retired: all.filter((t) => !t.isActive).length,
  };

  return (
    <Page
      title="Templates"
      subtitle="The starting points a new store can be built from"
      action={<PrimaryButton onClick={() => setDraft(blank)}>Add template</PrimaryButton>}
    >
      <FormError error={setActive.error} />

      {all.length > 0 && (
        <div className="mb-5 flex gap-1 rounded-card border border-ink-100 bg-white p-1 shadow-card sm:w-fit">
          {(['all', 'active', 'retired'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 rounded px-3 py-1 text-sm capitalize transition-colors sm:flex-none ${
                filter === f ? 'bg-ink-950 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}
            >
              {f} <span className="numeric opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {templates.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-card border border-ink-100 bg-white">
              <div className="skeleton h-32 rounded-none" />
              <div className="space-y-2 p-5">
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading…</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <article
            key={t.id}
            className={`group flex flex-col overflow-hidden rounded-card border border-ink-100 bg-white shadow-card transition-shadow hover:shadow-raised ${
              t.isActive ? '' : 'opacity-70'
            }`}
          >
            <div className="h-32 border-b border-ink-100">
              <TemplatePreview
                name={t.name}
                theme={t.defaultTheme}
                sections={t.layoutConfig?.sections}
                previewImage={t.previewImage}
              />
            </div>

            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium text-ink-950">{t.name}</h2>
                  <p className="mt-0.5 text-xs capitalize text-ink-500">{t.category}</p>
                </div>
                {!t.isActive && <StatusBadge value="retired" />}
              </div>

              {t.description && (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-500">
                  {t.description}
                </p>
              )}

              {/* Which sections, in which order. The preview shows this too, but
                  the names are what a decision gets argued about. */}
              {(t.layoutConfig?.sections?.length ?? 0) > 0 && (
                <ol className="mt-3 flex flex-wrap gap-1">
                  {t.layoutConfig.sections!.map((s, i) => (
                    <li
                      key={s}
                      className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600"
                    >
                      <span className="numeric mr-1 text-ink-400">{i + 1}</span>
                      {SECTION_LABELS[s] ?? s}
                    </li>
                  ))}
                </ol>
              )}

              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                <Store size={12} className="text-ink-400" />
                {t._count.stores === 0
                  ? 'Nothing built from it yet'
                  : `${t._count.stores} store${t._count.stores === 1 ? '' : 's'}`}
              </p>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <SecondaryButton size="sm" onClick={() => edit(t)}>
                  Edit
                </SecondaryButton>
                <SecondaryButton
                  size="sm"
                  disabled={setActive.isPending}
                  onClick={() => setActive.mutate({ id: t.id, isActive: !t.isActive })}
                >
                  {t.isActive ? 'Retire' : 'Restore'}
                </SecondaryButton>
                {/* Offered only when nothing was built from it — the API refuses
                    the rest, and a button that always fails is worse than none. */}
                {t._count.stores === 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(t)}
                    className="ml-auto rounded px-1 text-xs text-ink-500 transition-colors hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {!templates.isLoading && all.length === 0 && (
        <EmptyState
          icon={<LayoutTemplate size={18} />}
          title="No templates yet"
          hint="Stores can still be created — they just start from platform defaults."
          action={<PrimaryButton onClick={() => setDraft(blank)}>Add template</PrimaryButton>}
        />
      )}

      {!templates.isLoading && all.length > 0 && shown.length === 0 && (
        <EmptyState
          icon={<LayoutTemplate size={18} />}
          title={`No ${filter} templates`}
          hint="Change the filter to see the rest of the catalogue."
        />
      )}

      {draft && (
        <Modal
          title={draft.id ? `Edit ${draft.name}` : 'Add template'}
          description="Starting values, copied into a store's theme when it is created."
          onClose={() => setDraft(null)}
          width="lg"
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !draft.name || !draft.category}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save template'}
              </PrimaryButton>
            </>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_13rem]">
            <div>
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
                  <Field label="Slug" hint="Derived from the name when left blank" wide>
                    <Input
                      value={draft.slug}
                      onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    />
                  </Field>
                )}

                <Field
                  label="Description"
                  hint="Shown under the name in both pickers. Say what the layout does."
                  wide
                >
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

                {/* Part of the look a store inherits. A template that sets only
                    colours produces a blank white page, which is what made
                    every new store feel unfinished. */}
                <Field label="Page background">
                  <Select
                    value={draft.background}
                    onChange={(e) => setDraft({ ...draft, background: e.target.value })}
                  >
                    {(options.data?.backgrounds ?? ['plain']).map((b) => (
                      <option key={b} value={b}>
                        {BACKGROUND_LABELS[b]?.name ?? b}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Logo size" hint="Header height a store starts with">
                  <Select
                    value={draft.logoSize}
                    onChange={(e) => setDraft({ ...draft, logoSize: e.target.value })}
                  >
                    {(options.data?.logoSizes ?? ['md']).map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>

              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-ink-700">Homepage sections</legend>
                <p className="mt-0.5 text-xs text-ink-500">
                  Ticked sections appear in this order. The order is what makes one template
                  different from another, not just the colours.
                </p>

                <div className="mt-3 space-y-1">
                  {(options.data?.sections ?? []).map((section) => {
                    const index = draft.sections.indexOf(section);
                    const on = index !== -1;
                    return (
                      <div
                        key={section}
                        className="flex items-center gap-3 rounded-card border border-ink-100 px-3 py-2"
                      >
                        <input
                          id={`section-${section}`}
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleSection(section)}
                          className="h-4 w-4 rounded border-ink-300"
                        />
                        <label
                          htmlFor={`section-${section}`}
                          className={`flex-1 text-sm ${on ? 'text-ink-900' : 'text-ink-500'}`}
                        >
                          {SECTION_LABELS[section] ?? section}
                        </label>

                        {on && (
                          <span className="flex items-center gap-1">
                            <span className="numeric mr-1 text-xs text-ink-400">
                              {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => move(index, -1)}
                              disabled={index === 0}
                              aria-label={`Move ${SECTION_LABELS[section] ?? section} earlier`}
                              className="rounded border border-ink-200 px-1.5 text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => move(index, 1)}
                              disabled={index === draft.sections.length - 1}
                              aria-label={`Move ${SECTION_LABELS[section] ?? section} later`}
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
              </fieldset>
            </div>

            {/* The preview updates as the form is filled in, so a colour is
                chosen against the layout it will actually sit in. */}
            <div className="lg:sticky lg:top-0 lg:self-start">
              <p className="mb-1.5 text-xs uppercase tracking-wide text-ink-500">Preview</p>
              <div className="h-44 overflow-hidden rounded-card border border-ink-100 shadow-card">
                <TemplatePreview
                  name={draft.name || 'Template'}
                  theme={{
                    primaryColor: draft.primaryColor,
                    secondaryColor: draft.secondaryColor,
                    accentColor: draft.accentColor,
                    headingFont: draft.headingFont,
                  }}
                  sections={draft.sections}
                  previewImage={draft.previewImage || null}
                />
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-ink-700">Thumbnail</p>
                <p className="mb-1.5 mt-0.5 text-xs text-ink-500">
                  Optional. Replaces the generated preview above.
                </p>
                <ImageUpload
                  label="thumbnail"
                  purpose="template"
                  aspect="wide"
                  value={draft.previewImage}
                  onChange={(url) => setDraft({ ...draft, previewImage: url })}
                />
              </div>
            </div>
          </div>

          <p className="mt-6 border-t border-ink-100 pt-4 text-xs text-ink-500">
            Editing a template never changes a storefront that already exists — a store keeps the
            copy it was created with.
          </p>

          <FormError error={save.error} />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={`Delete ${confirmDelete.name}?`}
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setConfirmDelete(null)}>Keep it</SecondaryButton>
              <button
                type="button"
                onClick={() => remove.mutate(confirmDelete.id)}
                disabled={remove.isPending}
                className="inline-flex h-9 items-center rounded-card bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40"
              >
                {remove.isPending ? 'Deleting…' : 'Delete template'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            This removes the template from the catalogue permanently. Retiring it instead keeps the
            row and only takes it out of the pickers.
          </p>
          <FormError error={remove.error} />
        </Modal>
      )}
    </Page>
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
        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-ink-200 bg-white p-1"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full rounded-card border border-ink-200 px-3 py-2 font-mono text-sm uppercase transition-colors focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950"
      />
    </div>
  );
}
