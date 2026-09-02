import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { bannerAdminService } from '@/services/admin.service';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { Field, FormError, FormGrid, Input, Modal, Select } from '@/components/admin/Modal';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { formatDate } from '@/utils/format';
import type { AdminBanner, BannerPlacement } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

const PLACEMENT_LABELS: Record<BannerPlacement, string> = {
  HOME_HERO: 'Homepage hero',
  SITE_ANNOUNCEMENT: 'Announcement bar',
};

const PLACEMENT_HINTS: Record<BannerPlacement, string> = {
  HOME_HERO: 'A large image at the top of the homepage. The first one shows.',
  SITE_ANNOUNCEMENT: 'A thin strip above the header, on every page. The first one shows.',
};

interface Draft {
  id?: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  placement: BannerPlacement;
  position: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
  /** Empty means "use the store's brand colour, white text and body font". */
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: string;
}

const blank: Draft = {
  title: '',
  subtitle: '',
  imageUrl: '',
  linkUrl: '',
  placement: 'HOME_HERO',
  position: '0',
  isActive: true,
  startsAt: '',
  endsAt: '',
  backgroundColor: '',
  textColor: '',
  fontFamily: '',
  fontSize: '',
};

/** The three sizes, named as a shopkeeper would say them. */
const SIZE_LABELS: Record<string, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };

/** What the preview strip renders each size as. Mirrors StorefrontLayout. */
const PREVIEW_TEXT: Record<string, string> = {
  sm: 'text-[11px]',
  md: 'text-xs',
  lg: 'text-sm',
};

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toIso = (local: string): string | undefined =>
  local.trim() === '' ? undefined : new Date(local).toISOString();

export default function Banners() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const banners = useQuery({
    queryKey: ['admin-banners'],
    queryFn: () => bannerAdminService.list(),
  });

  /**
   * The same list the Appearance editor offers, from the same endpoint, so the
   * strip cannot be set in a font the server will refuse — the storefront asks
   * Google Fonts for these by name and an arbitrary string becomes a request
   * URL.
   */
  const options = useQuery({
    queryKey: ['theme-options'],
    queryFn: () =>
      unwrap<{ fonts: string[] }>(apiClient.get('/theme/options')),
    staleTime: 5 * 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-banners'] });

  const save = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (d: Draft) => {
      const payload = {
        title: d.title || undefined,
        subtitle: d.subtitle || undefined,
        imageUrl: d.imageUrl,
        linkUrl: d.linkUrl || undefined,
        placement: d.placement,
        position: Number(d.position || 0),
        isActive: d.isActive,
        startsAt: toIso(d.startsAt),
        endsAt: toIso(d.endsAt),
        /**
         * Sent raw, including as an empty string.
         *
         * The API reads an absent field as "not editing this" and an empty one
         * as "clear it", so `|| undefined` would make going back to the brand
         * colour impossible — the save would succeed and change nothing.
         */
        backgroundColor: d.backgroundColor,
        textColor: d.textColor,
        fontFamily: d.fontFamily,
        fontSize: d.fontSize,
      };
      return d.id
        ? bannerAdminService.update(d.id, payload)
        : bannerAdminService.create(payload);
    },
    onSuccess: () => {
      toast.saved('Banner saved');
      refresh();
      setDraft(null);
    },
  });

  const remove = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (id: string) => bannerAdminService.remove(id),
    onSuccess: refresh,
  });

  const edit = (b: AdminBanner) =>
    setDraft({
      id: b.id,
      title: b.title ?? '',
      subtitle: b.subtitle ?? '',
      imageUrl: b.imageUrl ?? '',
      linkUrl: b.linkUrl ?? '',
      placement: b.placement,
      position: String(b.position),
      isActive: b.isActive,
      startsAt: toLocalInput(b.startsAt),
      endsAt: toLocalInput(b.endsAt),
      backgroundColor: b.backgroundColor ?? '',
      textColor: b.textColor ?? '',
      fontFamily: b.fontFamily ?? '',
      fontSize: b.fontSize ?? '',
    });

  const groups = (Object.keys(PLACEMENT_LABELS) as BannerPlacement[]).map((placement) => ({
    placement,
    items: (banners.data ?? []).filter((b) => b.placement === placement),
  }));

  return (
    <Page
      title="Banners"
      subtitle="Scheduled promotional images on your storefront"
      action={<PrimaryButton onClick={() => setDraft(blank)}>Add banner</PrimaryButton>}
    >
      {banners.isLoading && <p className="text-sm text-ink-500">Loading…</p>}

      <FormError error={remove.error} />

      <div className="space-y-8">
        {groups.map(({ placement, items }) => (
          <section key={placement}>
            <h2 className="text-sm font-medium text-ink-950">{PLACEMENT_LABELS[placement]}</h2>
            <p className="mt-0.5 text-xs text-ink-500">{PLACEMENT_HINTS[placement]}</p>

            {items.length === 0 ? (
              <div className="mt-3 rounded-card border border-dashed border-ink-300 bg-white p-8 text-center">
                <p className="text-sm text-ink-500">Nothing here — the storefront shows its usual content.</p>
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {items.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-4 rounded-card border border-ink-100 bg-white p-4"
                  >
                    {b.imageUrl ? (
                      <img
                        src={b.imageUrl}
                        alt=""
                        className="h-14 w-24 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded bg-ink-50 text-[10px] text-ink-300">
                        Text only
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-900">
                        {b.title || <span className="text-ink-500">Untitled</span>}
                      </p>
                      {b.subtitle && (
                        <p className="truncate text-xs text-ink-500">{b.subtitle}</p>
                      )}
                      <p className="mt-1 text-xs text-ink-500">{schedule(b)}</p>
                    </div>

                    <StatusBadge value={b.isLive ? 'active' : 'draft'} />

                    <div className="flex gap-3">
                      <button onClick={() => edit(b)} className="text-xs underline">
                        Edit
                      </button>
                      <button
                        onClick={() => remove.mutate(b.id)}
                        disabled={remove.isPending}
                        className="text-xs text-red-600 underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {draft && (
        <Modal
          title={draft.id ? 'Edit banner' : 'Add banner'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <SecondaryButton onClick={() => setDraft(null)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={save.isPending || !isComplete(draft)}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </PrimaryButton>
            </>
          }
        >
          <FormGrid>
            <Field label="Placement" hint={PLACEMENT_HINTS[draft.placement]} wide>
              <Select
                value={draft.placement}
                onChange={(e) =>
                  setDraft({ ...draft, placement: e.target.value as BannerPlacement })
                }
              >
                {(Object.keys(PLACEMENT_LABELS) as BannerPlacement[]).map((p) => (
                  <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>
                ))}
              </Select>
            </Field>

            <Field
              label="Image"
              hint={
                draft.placement === 'HOME_HERO'
                  ? 'Required — the hero is the image'
                  : 'Optional for an announcement'
              }
              wide
            >
              <div className="mt-1.5">
                <ImageUpload
                  label="Banner"
                  purpose="banner"
                  aspect="banner"
                  value={draft.imageUrl}
                  onChange={(url) => setDraft({ ...draft, imageUrl: url })}
                />
              </div>
            </Field>

            <Field
              label={draft.placement === 'SITE_ANNOUNCEMENT' ? 'Message' : 'Title'}
              hint={
                draft.placement === 'SITE_ANNOUNCEMENT'
                  ? 'Required — this is what the strip says'
                  : undefined
              }
            >
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>

            <Field label="Subtitle">
              <Input
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
              />
            </Field>

            <Field
              label="Link"
              hint="A path like /shop, or a full https:// address"
              wide
            >
              <Input
                value={draft.linkUrl}
                placeholder="/shop"
                onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
              />
            </Field>

            <Field label="Starts" hint="Leave blank to show immediately">
              <Input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
            </Field>

            <Field label="Ends" hint="Leave blank to run until you stop it">
              <Input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              />
            </Field>

            <Field label="Order" hint="Lower shows first">
              <Input
                type="number"
                min={0}
                value={draft.position}
                onChange={(e) => setDraft({ ...draft, position: e.target.value })}
              />
            </Field>

            <Field label="Status">
              <Select
                value={draft.isActive ? 'on' : 'off'}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.value === 'on' })}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </Select>
            </Field>
          </FormGrid>

          {/* Styling belongs to the strip only: a hero is its image, and giving
              it a background colour would suggest a control that draws nothing. */}
          {draft.placement === 'SITE_ANNOUNCEMENT' && (
            <div className="mt-6 border-t border-ink-100 pt-5">
              <p className="text-sm font-medium text-ink-950">Colour and type</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Optional. Leave these alone and the strip uses your brand colour, white text
                and your store's body font.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ColourField
                  label="Background"
                  fallbackLabel="Brand colour"
                  value={draft.backgroundColor}
                  onChange={(backgroundColor) => setDraft({ ...draft, backgroundColor })}
                />
                <ColourField
                  label="Text"
                  fallbackLabel="White"
                  value={draft.textColor}
                  onChange={(textColor) => setDraft({ ...draft, textColor })}
                />

                <Field label="Font">
                  <Select
                    value={draft.fontFamily}
                    onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value })}
                  >
                    <option value="">Your body font</option>
                    {(options.data?.fonts ?? []).map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </Select>
                </Field>

                <Field label="Size">
                  <Select
                    value={draft.fontSize}
                    onChange={(e) => setDraft({ ...draft, fontSize: e.target.value })}
                  >
                    <option value="">Medium</option>
                    {Object.entries(SIZE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* Drawn with the values being edited rather than described, so a
                  pale colour on white is visibly a mistake before it is saved
                  onto every page of the storefront. */}
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-ink-500">On your storefront</p>
                <div
                  className={`mt-2 rounded-card px-4 py-2.5 text-center tracking-wide ${
                    PREVIEW_TEXT[draft.fontSize] ?? PREVIEW_TEXT.md
                  }`}
                  style={{
                    backgroundColor: draft.backgroundColor || '#166534',
                    color: draft.textColor || '#ffffff',
                    ...(draft.fontFamily
                      ? { fontFamily: `'${draft.fontFamily}', sans-serif` }
                      : {}),
                  }}
                >
                  <span className="font-medium">
                    {draft.title || 'Your announcement goes here'}
                  </span>
                  {draft.subtitle && <span className="ml-2 opacity-75">{draft.subtitle}</span>}
                </div>
                {!draft.backgroundColor && (
                  <p className="mt-1.5 text-xs text-ink-500">
                    Shown in the default green — your storefront uses your own brand colour.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* A hero renders full-bleed, so the thumbnail in the picker is not
              enough to judge the crop. */}
          {draft.imageUrl && draft.placement === 'HOME_HERO' && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-ink-500">At full width</p>
              <img
                src={draft.imageUrl}
                alt=""
                className="mt-2 max-h-40 w-full rounded-card object-cover"
              />
            </div>
          )}

          <FormError error={save.error} />
        </Modal>
      )}
    </Page>
  );
}

/**
 * A colour with an explicit way back to "not set".
 *
 * A bare `<input type="color">` has no empty state — it always reports some
 * colour — so once a shopkeeper touched it there would be no way to return the
 * strip to the store's brand colour short of guessing the hex. Clear does that.
 */
function ColourField({
  label,
  fallbackLabel,
  value,
  onChange,
}: {
  label: string;
  fallbackLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={value ? undefined : `Using ${fallbackLabel.toLowerCase()}`}>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={value || '#166534'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour`}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-ink-200 bg-white p-1"
        />
        <input
          value={value}
          spellCheck={false}
          placeholder={fallbackLabel}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-card border border-ink-200 px-3 py-2 font-mono text-sm uppercase transition-colors focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 text-xs text-ink-500 underline hover:text-ink-900"
          >
            Clear
          </button>
        )}
      </div>
    </Field>
  );
}

/**
 * Mirrors the API's per-placement rule so Save is disabled rather than the
 * server refusing a form the user has already filled in. The server still
 * checks — this only moves the feedback earlier.
 */
function isComplete(d: Draft): boolean {
  if (d.placement === 'HOME_HERO') return d.imageUrl.trim() !== '';
  return d.title.trim() !== '';
}

/** Says why a banner is or is not showing, rather than only whether it is on. */
function schedule(b: AdminBanner): string {
  if (!b.isActive) return 'Switched off';

  const now = new Date();
  if (b.startsAt && new Date(b.startsAt) > now) return `Scheduled for ${formatDate(b.startsAt)}`;
  if (b.endsAt && new Date(b.endsAt) < now) return `Ended ${formatDate(b.endsAt)}`;
  if (b.endsAt) return `Showing until ${formatDate(b.endsAt)}`;
  return 'Showing now';
}
