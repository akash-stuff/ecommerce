import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ImageOff, Pencil, Tags, Trash2 } from 'lucide-react';
import { categoryService } from '@/services/admin.service';
import { EmptyState, Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { ImageUpload } from '@/components/admin/ImageUpload';
import {
  Field,
  FormError,
  FormGrid,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/admin/Modal';
import type { CategoryNode } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

interface Draft {
  id?: string;
  name: string;
  slug: string;
  parentId: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
}

const empty: Draft = {
  name: '',
  slug: '',
  parentId: '',
  description: '',
  imageUrl: '',
  isActive: true,
};

export default function Categories() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryNode | null>(null);

  const tree = useQuery({ queryKey: ['admin-categories'], queryFn: categoryService.tree });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    setDraft(null);
  };

  const save = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (d: Draft) => {
      const payload = {
        name: d.name,
        slug: d.slug || undefined,
        parentId: d.parentId || undefined,
        description: d.description || undefined,
        // Empty string, not undefined: an omitted field leaves the old image in
        // place, which is not what removing one means.
        imageUrl: d.imageUrl,
        isActive: d.isActive,
      };
      return d.id ? categoryService.update(d.id, payload) : categoryService.create(payload);
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (id: string) => categoryService.remove(id),
    onSuccess: () => {
      toast.saved('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      setConfirmDelete(null);
    },
  });

  const flat = flatten(tree.data ?? []);

  return (
    <Page
      title="Categories"
      subtitle="How your catalogue is organised for shoppers"
      action={<PrimaryButton onClick={() => setDraft(empty)}>Add category</PrimaryButton>}
    >
      {/* The empty state carries its own dashed frame, so it replaces the list
          surface rather than sitting inside it. */}
      {tree.data?.length === 0 && (
        <EmptyState
          icon={<Tags size={18} />}
          title="No categories yet"
          hint="Group your products so shoppers can browse them."
          action={<PrimaryButton onClick={() => setDraft(empty)}>Add category</PrimaryButton>}
        />
      )}

      {tree.data?.length !== 0 && (
      <div className="overflow-hidden rounded-card border border-ink-100 bg-white shadow-card">
        {tree.isLoading && (
          <div className="space-y-3 p-4" aria-busy="true">
            <span className="sr-only">Loading…</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-7 w-7 shrink-0" />
                <div className="skeleton h-3" style={{ width: `${34 - i * 4}%` }} />
              </div>
            ))}
          </div>
        )}

        {tree.isError && (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-700">Categories couldn&apos;t be loaded.</p>
            <button
              type="button"
              onClick={() => tree.refetch()}
              className="mt-2 text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-950"
            >
              Try again
            </button>
          </div>
        )}

        {flat.length > 0 && (
          <ul className="divide-y divide-ink-50">
            {flat.map(({ node, depth }) => (
              <li key={node.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span style={{ paddingLeft: depth * 20 }} className="flex min-w-0 items-center gap-2">
                  {depth > 0 && <ChevronRight size={13} className="shrink-0 text-ink-300" />}
                  {node.imageUrl ? (
                    <img
                      src={node.imageUrl}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-ink-50 text-ink-300">
                      <ImageOff size={12} />
                    </span>
                  )}
                  <span
                    className={`truncate ${node.isActive ? 'text-ink-900' : 'text-ink-500 line-through'}`}
                  >
                    {node.name}
                  </span>
                </span>

                <span className="font-mono text-xs text-ink-300">{node.slug}</span>

                <span className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() =>
                      setDraft({
                        id: node.id,
                        name: node.name,
                        slug: node.slug,
                        parentId: node.parentId ?? '',
                        description: node.description ?? '',
                        imageUrl: node.imageUrl ?? '',
                        isActive: node.isActive,
                      })
                    }
                    aria-label={`Edit ${node.name}`}
                    className="rounded p-1.5 text-ink-500 hover:bg-ink-50"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(node)}
                    aria-label={`Delete ${node.name}`}
                    className="rounded p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {draft && (
        <Modal
          title={draft.id ? 'Edit category' : 'Add category'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton disabled={save.isPending || !draft.name} onClick={() => save.mutate(draft)}>
                {save.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Name" wide>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>

            <Field label="Slug" hint="Left blank, one is made from the name">
              <Input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              />
            </Field>

            <Field label="Parent">
              <Select
                value={draft.parentId}
                onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
              >
                <option value="">No parent (top level)</option>
                {flat
                  // A category cannot be its own parent; the server also refuses
                  // anything that would put it inside its own subtree.
                  .filter(({ node }) => node.id !== draft.id)
                  .map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>
                      {'— '.repeat(depth)}
                      {node.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Description" wide>
              <Textarea
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>

            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-ink-700">Image</p>
              <p className="mb-2 mt-0.5 text-xs text-ink-500">
                Shown on the category grid and at the top of the category page.
              </p>
              <ImageUpload
                label="image"
                purpose="category"
                aspect="wide"
                value={draft.imageUrl}
                onChange={(url) => setDraft({ ...draft, imageUrl: url })}
              />
            </div>

            <Field label="Visible to shoppers">
              <Select
                value={draft.isActive ? 'yes' : 'no'}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.value === 'yes' })}
              >
                <option value="yes">Yes</option>
                <option value="no">Hidden</option>
              </Select>
            </Field>
          </FormGrid>

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
            A category still holding products or subcategories will be refused — move those first.
          </p>
          <FormError error={remove.error} />
        </Modal>
      )}
    </Page>
  );
}

/** Depth-first, carrying depth so the tree reads as an indented list. */
function flatten(nodes: CategoryNode[], depth = 0): { node: CategoryNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}
