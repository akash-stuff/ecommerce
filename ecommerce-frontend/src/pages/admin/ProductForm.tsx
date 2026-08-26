import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { productService } from '@/services/store.service';
import { categoryService } from '@/services/admin.service';
import { apiClient, unwrap } from '@/services/api-client';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { Field, FormError, FormGrid, Input, Select, Textarea } from '@/components/admin/Modal';
import { ImageListUpload } from '@/components/admin/ImageListUpload';
import type { Product } from '@/types/api';

interface Draft {
  name: string;
  sku: string;
  slug: string;
  price: string;
  compareAtPrice: string;
  taxRate: string;
  stock: string;
  lowStockThreshold: string;
  categoryId: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  isFeatured: boolean;
  shortDescription: string;
  description: string;
  weightGrams: string;
  imageUrls: string[];
}

const empty: Draft = {
  name: '', sku: '', slug: '', price: '', compareAtPrice: '', taxRate: '18',
  stock: '0', lowStockThreshold: '5', categoryId: '', status: 'DRAFT',
  isFeatured: false, shortDescription: '', description: '', weightGrams: '', imageUrls: [],
};

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

export default function ProductForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(empty);

  const existing = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => unwrap<Product & Record<string, unknown>>(apiClient.get(`/products/${id}`)),
    enabled: isEdit,
  });

  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: categoryService.tree });

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setDraft({
      name: p.name,
      sku: p.sku,
      slug: p.slug,
      price: String(Number(p.price)),
      compareAtPrice: p.compareAtPrice ? String(Number(p.compareAtPrice)) : '',
      taxRate: String(Number((p as { taxRate?: string }).taxRate ?? 18)),
      stock: String(p.stock),
      lowStockThreshold: String((p as { lowStockThreshold?: number }).lowStockThreshold ?? 5),
      categoryId: p.category?.id ?? '',
      status: p.status,
      isFeatured: p.isFeatured,
      shortDescription: p.shortDescription ?? '',
      description: (p as { description?: string }).description ?? '',
      weightGrams: (p as { weightGrams?: number }).weightGrams
        ? String((p as { weightGrams?: number }).weightGrams)
        : '',
      imageUrls: p.images.map((i) => i.url),
    });
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: draft.name,
        sku: draft.sku,
        price: Number(draft.price),
        compareAtPrice: num(draft.compareAtPrice),
        taxRate: num(draft.taxRate),
        stock: num(draft.stock) ?? 0,
        lowStockThreshold: num(draft.lowStockThreshold),
        categoryId: draft.categoryId || undefined,
        status: draft.status,
        isFeatured: draft.isFeatured,
        shortDescription: draft.shortDescription || undefined,
        description: draft.description || undefined,
        weightGrams: num(draft.weightGrams),
      };

      // Slug is derived server-side on create; sending a blank one would fail
      // validation rather than fall back.
      if (draft.slug) payload.slug = draft.slug;

      if (draft.imageUrls.length > 0) payload.imageUrls = draft.imageUrls;

      return isEdit ? productService.update(id!, payload) : productService.create(payload);
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-product', id] });
      navigate(`/admin/products/${(product as Product).id}/edit`, { replace: true });
    },
  });

  const flatCategories = flatten(categories.data ?? []);

  return (
    <Page
      title={isEdit ? draft.name || 'Edit product' : 'New product'}
      subtitle={isEdit ? draft.sku : 'Add something to your catalogue'}
      action={
        <button
          onClick={() => navigate('/admin/products')}
          className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft size={15} /> All products
        </button>
      }
    >
      {isEdit && existing.isLoading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-8"
        >
          <Card title="Basics">
            <FormGrid>
              <Field label="Name" wide>
                <Input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>

              <Field label="SKU" hint="Unique within your store">
                <Input
                  required
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                />
              </Field>

              <Field label="URL slug" hint={isEdit ? undefined : 'Left blank, made from the name'}>
                <Input
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                />
              </Field>

              <Field label="Category">
                <Select
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                >
                  <option value="">Uncategorised</option>
                  {flatCategories.map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>
                      {'— '.repeat(depth)}
                      {node.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Status" hint="Only active products appear in the storefront">
                <Select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as Draft['status'] })
                  }
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
            </FormGrid>
          </Card>

          <Card title="Pricing">
            <FormGrid>
              <Field label="Price">
                <Input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </Field>

              <Field label="Compare at" hint="Optional; shown struck through">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.compareAtPrice}
                  onChange={(e) => setDraft({ ...draft, compareAtPrice: e.target.value })}
                />
              </Field>

              <Field label="Tax rate %" hint="Applied to the discounted price at checkout">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.taxRate}
                  onChange={(e) => setDraft({ ...draft, taxRate: e.target.value })}
                />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Stock">
            <FormGrid>
              <Field
                label="Quantity"
                hint={isEdit ? 'Corrections here are not recorded in the stock ledger — use Inventory for that' : undefined}
              >
                <Input
                  type="number"
                  min={0}
                  value={draft.stock}
                  onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                />
              </Field>

              <Field label="Low stock warning at">
                <Input
                  type="number"
                  min={0}
                  value={draft.lowStockThreshold}
                  onChange={(e) => setDraft({ ...draft, lowStockThreshold: e.target.value })}
                />
              </Field>

              <Field label="Weight (grams)" hint="Used for per-kg delivery rates">
                <Input
                  type="number"
                  min={0}
                  value={draft.weightGrams}
                  onChange={(e) => setDraft({ ...draft, weightGrams: e.target.value })}
                />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Description and images">
            <FormGrid>
              <Field label="Short description" wide>
                <Textarea
                  rows={2}
                  value={draft.shortDescription}
                  onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })}
                />
              </Field>

              <Field label="Full description" wide>
                <Textarea
                  rows={5}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>

              <Field
                label="Images"
                wide
                hint="The first is used as the thumbnail everywhere else."
              >
                <ImageListUpload
                  value={draft.imageUrls}
                  onChange={(imageUrls) => setDraft({ ...draft, imageUrls })}
                />
              </Field>
            </FormGrid>
          </Card>

          <FormError error={save.error} />

          <div className="flex items-center gap-3">
            <PrimaryButton type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => navigate('/admin/products')}>
              Cancel
            </SecondaryButton>
            {save.isSuccess && <span className="text-sm text-green-700">Saved</span>}
          </div>
        </form>
      )}
    </Page>
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

function flatten(
  nodes: { id: string; name: string; children?: unknown[] }[],
  depth = 0,
): { node: { id: string; name: string }; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flatten((node.children ?? []) as typeof nodes, depth + 1),
  ]);
}
