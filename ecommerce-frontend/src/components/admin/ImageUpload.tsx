import { useRef, useState } from 'react';
import { Spinner } from '@/components/Spinner';
import { ImagePlus, Link2, Upload, X } from 'lucide-react';
import { mediaService, type UploadPurpose } from '@/services/admin.service';
import type { ApiError } from '@/types/api';
import { CropDialog, type CropSpec } from './CropDialog';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/**
 * Every shape an uploaded image can land in, named for where it lands.
 *
 * This replaced a `'square' | 'wide'` pair, which was the whole problem: the
 * banner upload passed neither, so it framed a *square* — while the storefront
 * renders a banner as a full-width hero 26–34rem tall. A shopkeeper positioned
 * a square and got a letterbox slice through the middle of it.
 *
 * Each ratio below is the ratio of the element the image is finally drawn into.
 * Change one here and you must change that element too, or the frame goes back
 * to lying about the result.
 */
export const ASPECTS = {
  /** Product tiles: `aspect-square` on both the grid and the detail page. */
  product: { ratio: 1, maxWidth: 1400, hint: 'Shown as a square on every product tile and page.' },
  /** The storefront hero: full width, 26–34rem tall, so close to 16/6. */
  banner: {
    ratio: 16 / 6,
    maxWidth: 2000,
    hint: 'Shown full width across the top of the homepage.',
  },
  /** Category cards. Home.tsx keeps every one of them this shape on purpose. */
  category: { ratio: 4 / 3, maxWidth: 1200, hint: 'Shown as a card on the homepage.' },
  page: { ratio: 16 / 9, maxWidth: 1800, hint: 'Shown across the head of the page.' },
  background: { ratio: 16 / 9, maxWidth: 2000, hint: 'Sits behind the storefront.' },
  template: { ratio: 4 / 3, maxWidth: 1200, hint: 'Shown in the template gallery.' },
} satisfies Record<string, CropSpec>;

export type AspectName = keyof typeof ASPECTS;

/**
 * Images that are previewed but never cropped.
 *
 * Both are drawn with `object-contain` everywhere they appear — a logo at a
 * fixed height in the storefront header, a favicon at 16px in a browser tab —
 * so there is no frame for them to fill and nothing for a crop to trim. Cutting
 * either could only remove something its owner meant to keep: a wordmark
 * shortened by a few pixels is a damaged wordmark, and a favicon is too small
 * to have a part worth choosing.
 *
 * `ratio` here is the shape of the *preview box* only. Nothing is written from
 * it, which is why these carry no `maxWidth` — the file is uploaded exactly as
 * it was picked.
 */
export const UNCROPPED = {
  logo: { ratio: 16 / 6, hint: 'Shown at a fixed height in the storefront header.' },
  favicon: { ratio: 1, hint: 'Shown in the browser tab, very small.' },
} satisfies Record<string, { ratio: number; hint: string }>;

export type UncroppedName = keyof typeof UNCROPPED;

/**
 * A drop zone with a file picker, and a URL box behind a disclosure.
 *
 * Both are kept because they solve different problems: uploading is what most
 * shopkeepers want, and pasting a URL is what you need when the image already
 * lives on a CDN, or when object storage is not configured and you would
 * otherwise be stuck. The value is a URL either way, so nothing downstream
 * knows or cares which was used.
 *
 * Uploading is the default and the URL box is folded away, rather than the two
 * sitting side by side as equals — a text field labelled "or paste a URL" next
 * to an Upload button is the field people fill in first and then wonder why
 * their file is not on it.
 *
 * A picked file is positioned in `CropDialog` before it is sent, so what is
 * stored is already the shape of the place it is going.
 */
export function ImageUpload({
  value,
  onChange,
  purpose = 'product',
  label = 'Image',
  aspect = 'product',
}: {
  value: string;
  onChange: (url: string) => void;
  purpose?: UploadPurpose;
  label?: string;
  /**
   * Where this image is going. Decides the shape of the preview *and* of the
   * crop frame, so the two cannot disagree.
   *
   * A name from `UNCROPPED` — `logo` or `favicon` — is previewed at that shape
   * and uploaded untouched. See the note on that map for why neither is cut.
   */
  aspect?: AspectName | UncroppedName;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  /** The file waiting to be positioned, or null when nothing is being cropped. */
  const [cropping, setCropping] = useState<File | null>(null);

  /** Null for the two that are never cut; `shape` still gives the preview box. */
  const spec: CropSpec | null = aspect in ASPECTS ? ASPECTS[aspect as AspectName] : null;
  const shape = spec ?? UNCROPPED[aspect as UncroppedName];

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const stored = await mediaService.upload(file, purpose);
      onChange(stored.url);
    } catch (e) {
      // The API's reason is more useful than a generic one: it distinguishes
      // "not an image" from "too large" from "storage is down".
      setError((e as ApiError).message ?? 'That file could not be uploaded.');
    } finally {
      setUploading(false);
      // Reset so picking the same file again still fires a change event.
      if (input.current) input.current.value = '';
    }
  };

  /**
   * A GIF goes straight up without the crop step: pushing one through a canvas
   * flattens it to a single still frame, which is not what anybody uploading an
   * animation wants. A logo and a favicon skip it for the reason above.
   */
  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!spec || file.type === 'image/gif') void upload(file);
    else setCropping(file);
  };

  /** Square slots stay narrow; the wide ones take the ratio they will be shown at. */
  const ratioStyle = shape.ratio !== 1 ? { aspectRatio: String(shape.ratio) } : undefined;
  const frame = shape.ratio === 1 ? 'aspect-square max-w-[13rem]' : '';

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {cropping && spec && (
        <CropDialog
          file={cropping}
          spec={spec}
          onCancel={() => {
            setCropping(null);
            if (input.current) input.current.value = '';
          }}
          onCropped={(cropped) => {
            setCropping(null);
            void upload(cropped);
          }}
        />
      )}

      {value ? (
        <div
          style={ratioStyle}
          className={`group relative overflow-hidden rounded-card border border-ink-100 bg-ink-50 ${frame}`}
        >
          {/* `contain` for a logo and `cover` for the rest, matching how the
              storefront draws each — so this preview is the result rather than
              an approximation of it. */}
          <img
            src={value}
            alt=""
            className={`h-full w-full ${spec ? 'object-cover' : 'object-contain p-2'}`}
          />

          {/* Replace and remove sit on the image itself. A thumbnail with the
              controls beside it reads as decoration; controls on top read as
              "this is the thing you are editing". */}
          <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-ink-950/75 to-transparent p-2 pt-6">
            <button
              type="button"
              disabled={uploading}
              onClick={() => input.current?.click()}
              className="rounded bg-white/95 px-2 py-1 text-xs font-medium text-ink-950 transition-colors hover:bg-white disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded bg-white/20 px-2 py-1 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/30"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          style={ratioStyle}
          className={`flex flex-col items-center justify-center rounded-card border border-dashed px-4 text-center transition-colors ${frame} ${
            dragging ? 'border-ink-950 bg-ink-50' : 'border-ink-200 bg-white hover:border-ink-300'
          }`}
        >
          {uploading ? (
            <>
              <Spinner size={18} label="Uploading" />
              <p className="mt-2 text-xs text-ink-500">Uploading…</p>
            </>
          ) : (
            <>
              <ImagePlus size={20} className="text-ink-300" />
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-card border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-900 transition-colors hover:bg-ink-50"
              >
                <Upload size={12} />
                Choose {label.toLowerCase()}
              </button>
              <p className="mt-1.5 text-[11px] text-ink-400">or drop a PNG, JPG, GIF or WebP</p>
            </>
          )}
        </div>
      )}

      {showUrl ? (
        <input
          value={value}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => !value && setShowUrl(false)}
          placeholder="https://…"
          className="mt-2 w-full rounded-card border border-ink-200 px-3 py-1.5 text-sm transition-colors focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowUrl(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-ink-500 transition-colors hover:text-ink-950"
        >
          <Link2 size={12} />
          Use an image URL instead
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
          <X size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
