import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select, Textarea } from '@/components/admin/Modal';
import type { PaginationMeta } from '@/types/api';

interface PageRow {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  updatedAt: string;
}

interface Draft {
  id?: string;
  title: string;
  slug: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  isPublished: boolean;
}

const blank: Draft = {
  title: '',
  slug: '',
  content: '',
  metaTitle: '',
  metaDescription: '',
  isPublished: false,
};

export default function Pages() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stripped, setStripped] = useState<string[]>([]);
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
    mutationFn: (d: Draft) => {
      const payload = {
        title: d.title,
        slug: d.slug || undefined,
        content: d.content,
        metaTitle: d.metaTitle || undefined,
        metaDescription: d.metaDescription || undefined,
        isPublished: d.isPublished,
      };
      return unwrap<{ removed: string[] }>(
        d.id ? apiClient.put(`/pages/${d.id}`, payload) : apiClient.post('/pages', payload),
      );
    },
    onSuccess: (result) => {
      // Reported rather than silently applied: the author should know their
      // markup changed and what was taken out.
      setStripped(result.removed ?? []);
      setDraft(null);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/pages/${id}`),
    onSuccess: () => {
      setConfirmDelete(null);
      refresh();
    },
  });

  const edit = async (row: PageRow) => {
    const full = await unwrap<Draft & { id: string }>(apiClient.get(`/pages/${row.id}`));
    setDraft({
      id: full.id,
      title: full.title,
      slug: full.slug,
      content: full.content ?? '',
      metaTitle: full.metaTitle ?? '',
      metaDescription: full.metaDescription ?? '',
      isPublished: full.isPublished,
    });
  };

  const columns: Column<PageRow>[] = [
    { header: 'Title', cell: (p) => <span className="text-ink-900">{p.title}</span> },
    { header: 'Address', cell: (p) => <span className="font-mono text-xs text-ink-500">/{p.slug}</span> },
    {
      header: 'Updated',
      cell: (p) => new Date(p.updatedAt).toLocaleDateString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    { header: 'Status', cell: (p) => <StatusBadge value={p.isPublished ? 'active' : 'draft'} /> },
    {
      header: '',
      cell: (p) => (
        <span className="flex justify-end gap-3">
          <button onClick={() => void edit(p)} className="text-xs underline">
            Edit
          </button>
          <button onClick={() => setConfirmDelete(p)} className="text-xs text-red-600 underline">
            Delete
          </button>
        </span>
      ),
      className: 'text-right',
    },
  ];

  return (
    <Page
      title="Pages"
      subtitle="About, Contact, Terms — anything that is not a product"
      action={<PrimaryButton onClick={() => setDraft(blank)}>Add page</PrimaryButton>}
    >
      {stripped.length > 0 && (
        <div className="mb-4 rounded-card bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Saved, but some markup was removed because it can run code:{' '}
          <strong>{stripped.join(', ')}</strong>.
        </div>
      )}

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

      {draft && (
        <Modal
          title={draft.id ? `Edit ${draft.title}` : 'Add page'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !draft.title || !draft.content}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Title" wide>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>

            <Field label="Address" hint="Left blank, one is made from the title">
              <Input
                value={draft.slug}
                placeholder="about"
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              />
            </Field>

            <Field label="Visible to shoppers">
              <Select
                value={draft.isPublished ? 'yes' : 'no'}
                onChange={(e) => setDraft({ ...draft, isPublished: e.target.value === 'yes' })}
              >
                <option value="no">Draft</option>
                <option value="yes">Published</option>
              </Select>
            </Field>

            <Field
              label="Content"
              wide
              hint="HTML. Headings, paragraphs, lists, links and images are kept; scripts and event handlers are removed on save."
            >
              <Textarea
                rows={12}
                spellCheck={false}
                value={draft.content}
                placeholder="<h2>About us</h2>&#10;<p>We started in 2019…</p>"
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </Field>

            <Field label="Page title for search engines" wide>
              <Input
                value={draft.metaTitle}
                onChange={(e) => setDraft({ ...draft, metaTitle: e.target.value })}
              />
            </Field>

            <Field label="Meta description" wide>
              <Textarea
                rows={2}
                value={draft.metaDescription}
                onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
              />
            </Field>
          </FormGrid>

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
              <button
                onClick={() => remove.mutate(confirmDelete.id)}
                disabled={remove.isPending}
                className="rounded-card bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            Anyone who has linked to <span className="font-mono">/{confirmDelete.slug}</span> will
            get a not-found page.
          </p>
          <FormError error={remove.error} />
        </Modal>
      )}
    </Page>
  );
}
