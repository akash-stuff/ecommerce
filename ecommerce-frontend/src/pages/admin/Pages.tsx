import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { mediaService } from '@/services/admin.service';
import { ImageUpload } from '@/components/admin/ImageUpload';
import {
  DangerButton,
  EmptyState,
  Page,
  PrimaryButton,
  SecondaryButton,
} from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';
import type { ApiError, PaginationMeta } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

interface PageRow {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  updatedAt: string;
}

/** One image in a page's gallery, as the API stores it. */
interface PageImage {
  url: string;
  caption?: string;
}

interface Draft {
  id?: string;
  title: string;
  slug: string;
  content: string;
  /** Artwork behind the page heading. Empty means the usual store surface. */
  backgroundImageUrl: string;
  images: PageImage[];
  metaTitle: string;
  metaDescription: string;
  isPublished: boolean;
}

const blank: Draft = {
  title: '',
  slug: '',
  content: '',
  backgroundImageUrl: '',
  images: [],
  metaTitle: '',
  metaDescription: '',
  isPublished: false,
};

/** The server refuses more than this; the form stops asking for them first. */
const MAX_PAGE_IMAGES = 12;

/** Mirrors the server's own slugifier, so the previewed address is the real one. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    // The server truncates here too (pages.service.ts normaliseSlug), so the
    // preview stays exact for a very long title rather than promising an
    // address that will come back shortened.
    .slice(0, 120);
}

export default function Pages() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PageRow | null>(null);

  const query = useQuery({
    queryKey: ['admin-pages', page],
    queryFn: () =>
      apiClient.get('/pages/admin', { params: { page, limit: 20 } }).then((r) => ({
        items: r.data.data as PageRow[],
        meta: r.data.meta as PaginationMeta,
      })),
    placeholderData: (previous) => previous,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-pages'] });

  const save = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (d: Draft) => {
      const payload = {
        title: d.title,
        slug: d.slug || undefined,
        content: d.content,
        /**
         * Both sent raw, empty included. The API reads an absent field as "not
         * editing this", so `|| undefined` would make removing a background
         * image or emptying the gallery save without complaint and change
         * nothing.
         */
        backgroundImageUrl: d.backgroundImageUrl,
        images: d.images,
        metaTitle: d.metaTitle || undefined,
        metaDescription: d.metaDescription || undefined,
        isPublished: d.isPublished,
      };
      return unwrap<{ removed: string[]; slug: string }>(
        d.id ? apiClient.put(`/pages/${d.id}`, payload) : apiClient.post('/pages', payload),
      );
    },
    onSuccess: (result, d) => {
      /**
       * What was stripped is reported in the confirmation itself.
       *
       * It used to sit in a banner above the table, which appeared after the
       * dialog closed and next to nothing that explained it. Saying it here ties
       * the fact to the save that caused it — an author should know their markup
       * changed and what came out.
       */
      const removed = result.removed ?? [];
      toast.saved(
        d.id ? 'Page updated' : 'Page created',
        removed.length > 0
          ? `Some markup was removed because it can run code: ${removed.join(', ')}`
          : `Saved at /${result.slug}`,
      );
      setDraft(null);
      refresh();
    },
  });

  /**
   * Editing loads the full row first, because the list does not carry content.
   *
   * A mutation rather than a bare async function: the previous version was an
   * unawaited `async` whose rejection went nowhere, so a failed fetch left the
   * Edit button looking broken — clicked, nothing happened, no error. This way
   * the button can show it is working and a failure reaches the corner.
   */
  const open = useMutation({
    onError: (e) => toastFromError(e, 'That page could not be opened.'),
    mutationFn: (row: PageRow) =>
      unwrap<Draft & { id: string }>(apiClient.get(`/pages/${row.id}`)),
    onSuccess: (full) =>
      setDraft({
        id: full.id,
        title: full.title,
        slug: full.slug,
        content: full.content ?? '',
        backgroundImageUrl: full.backgroundImageUrl ?? '',
        images: Array.isArray(full.images) ? full.images : [],
        metaTitle: full.metaTitle ?? '',
        metaDescription: full.metaDescription ?? '',
        isPublished: full.isPublished,
      }),
  });

  const remove = useMutation({
    onError: (e) => toastFromError(e),
    mutationFn: (id: string) => apiClient.delete(`/pages/${id}`),
    onSuccess: () => {
      toast.saved('Page deleted');
      setConfirmDelete(null);
      refresh();
    },
  });

  const columns: Column<PageRow>[] = [
    {
      header: 'Title',
      cell: (p) => <span className="font-medium text-ink-950">{p.title}</span>,
    },
    {
      header: 'Address',
      cell: (p) => (
        // Linked, because "is this page actually live" is answered by opening
        // it, and a draft has nothing to open.
        p.isPublished ? (
          <a
            href={`/${p.slug}`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 font-mono text-xs text-ink-600 transition-colors hover:text-ink-950"
          >
            /{p.slug}
            <ExternalLink size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        ) : (
          <span className="font-mono text-xs text-ink-400">/{p.slug}</span>
        )
      ),
    },
    {
      header: 'Updated',
      cell: (p) => new Date(p.updatedAt).toLocaleDateString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Status',
      cell: (p) => <StatusBadge value={p.isPublished ? 'published' : 'draft'} />,
    },
    {
      header: '',
      cell: (p) => (
        // Same shape as every other list on the platform: a text action for the
        // safe thing, an icon in red for the destructive one.
        <span className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => open.mutate(p)}
            disabled={open.isPending}
            className="inline-flex items-center gap-1.5 text-xs underline disabled:opacity-50"
          >
            {open.isPending && open.variables?.id === p.id && (
              <Loader2 size={11} className="animate-spin" />
            )}
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(p)}
            aria-label={`Delete ${p.title}`}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </span>
      ),
      className: 'text-right',
    },
  ];

  const empty = query.data?.items.length === 0;

  return (
    <Page
      title="Pages"
      subtitle="About, Contact, Terms — anything that is not a product"
      action={<PrimaryButton onClick={() => setDraft(blank)}>Add page</PrimaryButton>}
    >
      {empty ? (
        <EmptyState
          icon={<FileText size={18} />}
          title="No pages yet"
          hint="Most stores start with About and Contact. They appear in your storefront footer once published."
          action={<PrimaryButton onClick={() => setDraft(blank)}>Add your first page</PrimaryButton>}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={query.data?.items}
          meta={query.data?.meta}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onPage={setPage}
          emptyTitle="No pages yet"
          emptyHint="Most stores start with About and Contact."
          rowKey={(p) => p.id}
        />
      )}

      {draft && (
        <Modal
          title={draft.id ? `Edit ${draft.title}` : 'Add page'}
          description="Published pages appear in your storefront footer."
          width="lg"
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !draft.title.trim() || !draft.content.trim()}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : draft.id ? 'Save changes' : 'Create page'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Title" wide>
              <Input
                value={draft.title}
                placeholder="About us"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>

            <Field
              label="Address"
              hint={
                // The derived address shown rather than described, so nobody has
                // to guess what "made from the title" will produce.
                draft.slug
                  ? `Your page will live at /${slugify(draft.slug)}`
                  : draft.title
                    ? `Left blank, this becomes /${slugify(draft.title)}`
                    : 'Left blank, one is made from the title'
              }
            >
              <Input
                value={draft.slug}
                placeholder="about"
                spellCheck={false}
                className="font-mono"
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              />
            </Field>

            <Field label="Visible to shoppers">
              <Select
                value={draft.isPublished ? 'yes' : 'no'}
                onChange={(e) => setDraft({ ...draft, isPublished: e.target.value === 'yes' })}
              >
                <option value="no">Draft — only you can see it</option>
                <option value="yes">Published — live on your storefront</option>
              </Select>
            </Field>

            <Field
              label="Content"
              wide
              hint="HTML. Headings, paragraphs, lists, links and images are kept; scripts and event handlers are removed on save."
            >
              <Textarea
                rows={14}
                spellCheck={false}
                value={draft.content}
                placeholder={'<h2>About us</h2>\n<p>We started in 2019…</p>'}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                // Monospace: this is markup, and proportional type hides the
                // whitespace and nesting that make it readable.
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </Field>

            {/* Pictures, without having to write an <img> tag by hand. Typing
                markup is the whole reason a page used to be text and nothing
                else, and most shopkeepers will not do it. */}
            <Field
              label="Header image"
              wide
              hint="Optional. Sits behind the page title. Leave it empty and the title sits on your usual page background."
            >
              <div className="mt-1.5">
                <ImageUpload
                  label="header image"
                  purpose="page"
                  aspect="wide"
                  value={draft.backgroundImageUrl}
                  onChange={(backgroundImageUrl) =>
                    setDraft({ ...draft, backgroundImageUrl })
                  }
                />
              </div>
            </Field>

            <Field
              label="Images"
              wide
              hint={`Optional. Shown as a gallery under the content. Up to ${MAX_PAGE_IMAGES}.`}
            >
              <PageGallery
                value={draft.images}
                onChange={(images) => setDraft({ ...draft, images })}
              />
            </Field>

          </FormGrid>

          {/* SEO is a secondary concern on this form, so it is folded away
              rather than given equal weight to the page's actual content. */}
          <details className="mt-5 rounded-card border border-ink-100 bg-ink-50/50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-700">
              Search engine listing
            </summary>
            <div className="mt-4 space-y-4">
              <Field
                label="Page title"
                hint={`${draft.metaTitle.length}/200 · falls back to the page title`}
              >
                <Input
                  value={draft.metaTitle}
                  maxLength={200}
                  placeholder={draft.title || 'About us'}
                  onChange={(e) => setDraft({ ...draft, metaTitle: e.target.value })}
                />
              </Field>

              <Field
                label="Description"
                hint={`${draft.metaDescription.length}/300 · the grey text under the title in results`}
              >
                <Textarea
                  rows={2}
                  maxLength={300}
                  value={draft.metaDescription}
                  onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
                />
              </Field>
            </div>
          </details>

          {/* Says why the button is off, rather than leaving it greyed and
              unexplained. */}
          {(!draft.title.trim() || !draft.content.trim()) && (
            <p className="mt-4 text-xs text-ink-500">
              A title and some content are needed before this can be saved.
            </p>
          )}

          <FormError error={save.error} />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={`Delete ${confirmDelete.title}?`}
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setConfirmDelete(null)}>Keep it</SecondaryButton>
              <DangerButton
                disabled={remove.isPending}
                onClick={() => remove.mutate(confirmDelete.id)}
              >
                {remove.isPending ? 'Deleting…' : 'Delete page'}
              </DangerButton>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            This removes the page for good. Anyone who has linked to{' '}
            <span className="font-mono text-ink-950">/{confirmDelete.slug}</span> will get a
            not-found page.
          </p>
          <p className="mt-3 text-sm text-ink-500">
            To take it off the storefront without losing the text, set it back to Draft instead.
          </p>
          <FormError error={remove.error} />
        </Modal>
      )}
    </Page>
  );
}

/**
 * A page's gallery: upload, caption, reorder, remove.
 *
 * Its own component rather than the product one, because the two differ in what
 * the list *means*. A product's first image is its thumbnail everywhere on the
 * storefront, so that widget is built around which image is first; a page's
 * images are a row under the text, where order is presentation and a caption is
 * often the point of including the picture at all.
 */
function PageGallery({
  value,
  onChange,
}: {
  value: PageImage[];
  onChange: (images: PageImage[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const room = MAX_PAGE_IMAGES - value.length;

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);

    // Anything past the limit is refused here with a reason, rather than
    // uploaded and then rejected by the server after the wait.
    const chosen = Array.from(files).slice(0, Math.max(room, 0));
    if (chosen.length < files.length) {
      setError(`A page holds ${MAX_PAGE_IMAGES} images; the extra ones were not added.`);
    }
    if (chosen.length === 0) return;

    setUploading({ done: 0, total: chosen.length });
    const added: PageImage[] = [];

    // Sequential, like the product gallery: someone adding six photos from a
    // phone should not open six concurrent uploads on a slow connection.
    try {
      for (const file of chosen) {
        const stored = await mediaService.upload(file, 'page');
        added.push({ url: stored.url });
        setUploading({ done: added.length, total: chosen.length });
      }
    } catch (e) {
      setError((e as ApiError).message ?? 'That file could not be uploaded.');
    } finally {
      // Whatever succeeded before a failure is kept — re-uploading images that
      // already worked is a poor way to recover from one bad file.
      if (added.length) onChange([...value, ...added]);
      setUploading(null);
      if (input.current) input.current.value = '';
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="mt-1.5">
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => void pick(e.target.files)}
      />

      {value.length > 0 && (
        <ul className="mb-3 space-y-2">
          {value.map((image, index) => (
            <li
              key={`${image.url}-${index}`}
              className="flex items-center gap-3 rounded-card border border-ink-100 bg-white p-2"
            >
              <img
                src={image.url}
                alt=""
                className="h-14 w-20 shrink-0 rounded object-cover"
              />

              <input
                value={image.caption ?? ''}
                maxLength={200}
                placeholder="Caption — optional"
                aria-label={`Caption for image ${index + 1}`}
                onChange={(e) => {
                  const next = [...value];
                  next[index] = { ...image, caption: e.target.value };
                  onChange(next);
                }}
                className="w-full rounded-card border border-ink-200 px-3 py-1.5 text-sm transition-colors focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950"
              />

              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move image up"
                  className="rounded border border-ink-200 px-1.5 text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="Move image down"
                  className="rounded border border-ink-200 px-1.5 text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  aria-label="Remove image"
                  className="ml-1 rounded p-1 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {room > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pick(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center rounded-card border border-dashed px-4 py-6 text-center transition-colors ${
            dragging ? 'border-ink-950 bg-ink-50' : 'border-ink-200 bg-white hover:border-ink-300'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={18} className="animate-spin text-ink-400" />
              <p className="numeric mt-2 text-xs text-ink-500">
                Uploading {uploading.done + 1} of {uploading.total}…
              </p>
            </>
          ) : (
            <>
              <ImagePlus size={20} className="text-ink-300" />
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-card border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
              >
                <Upload size={13} />
                {value.length > 0 ? 'Add more images' : 'Upload images'}
              </button>
              <p className="mt-1.5 text-[11px] text-ink-400">
                or drop them here · {room} more can be added
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
