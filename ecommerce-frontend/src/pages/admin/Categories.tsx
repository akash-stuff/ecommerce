import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { categoryService } from '@/services/admin.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
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

interface Draft {
  id?: string;
  name: string;
  slug: string;
  parentId: string;
  description: string;
  isActive: boolean;
}

const empty: Draft = { name: '', slug: '', parentId: '', description: '', isActive: true };

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
    mutationFn: (d: Draft) => {
      const payload = {
        name: d.name,
        slug: d.slug || undefined,
        parentId: d.parentId || undefined,
        description: d.description || undefined,
        isActive: d.isActive,
      };
      return d.id ? categoryService.update(d.id, payload) : categoryService.create(payload);
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => categoryService.remove(id),
    onSuccess: () => {
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
      <div className="overflow-hidden rounded-card border border-ink-100 bg-white">
        {tree.isLoading && <div className="p-8 text-sm text-ink-500">Loading…</div>}

        {tree.isError && (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-700">Categories couldn't be loaded.</p>
            <button onClick={() => tree.refetch()} className="mt-2 text-sm underline">
              Try again
            </button>
          </div>
        )}

        {tree.data?.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-ink-700">No categories yet</p>
            <p className="mt-1 text-sm text-ink-500">
              Group your products so shoppers can browse them.
            </p>
          </div>
        )}

        {flat.length > 0 && (
          <ul className="divide-y divide-ink-50">
            {flat.map(({ node, depth }) => (
              <li key={node.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span style={{ paddingLeft: depth * 20 }} className="flex items-center gap-2">
                  {depth > 0 && <ChevronRight size={13} className="text-ink-300" />}
                  <span className={node.isActive ? 'text-ink-900' : 'text-ink-500 line-through'}>
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
