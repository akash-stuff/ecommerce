import { useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, Upload, X } from 'lucide-react';
import { mediaService, type UploadPurpose } from '@/services/admin.service';
import type { ApiError } from '@/types/api';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

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
 */
export function ImageUpload({
  value,
  onChange,
  purpose = 'product',
  label = 'Image',
  aspect = 'square',
}: {
  value: string;
  onChange: (url: string) => void;
  purpose?: UploadPurpose;
  label?: string;
  /** `wide` for anything shown as a banner or a card header. */
  aspect?: 'square' | 'wide';
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
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

  const frame = aspect === 'wide' ? 'aspect-[16/6]' : 'aspect-square max-w-[13rem]';

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />

      {value ? (
        <div className={`group relative overflow-hidden rounded-card border border-ink-100 bg-ink-50 ${frame}`}>
          <img src={value} alt="" className="h-full w-full object-cover" />

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
            void pick(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center rounded-card border border-dashed px-4 text-center transition-colors ${frame} ${
            dragging ? 'border-ink-950 bg-ink-50' : 'border-ink-200 bg-white hover:border-ink-300'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={18} className="animate-spin text-ink-400" />
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
