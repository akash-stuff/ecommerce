import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { mediaService } from '@/services/admin.service';
import type { ApiError } from '@/types/api';

type Purpose = 'product' | 'theme' | 'banner';

/**
 * A file picker and a URL box, together.
 *
 * Both are kept because they solve different problems: uploading is what most
 * shopkeepers want, and pasting a URL is what you need when the image already
 * lives on a CDN, or when object storage is not configured and you would
 * otherwise be stuck. The value is a URL either way, so nothing downstream
 * knows or cares which was used.
 */
export function ImageUpload({
  value,
  onChange,
  purpose = 'product',
  label = 'Image',
}: {
  value: string;
  onChange: (url: string) => void;
  purpose?: Purpose;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative shrink-0">
            <img
              src={value}
              alt=""
              className="h-20 w-20 rounded-card border border-ink-100 object-cover"
            />
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="absolute -right-2 -top-2 rounded-full bg-ink-950 p-1 text-white"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-card border border-dashed border-ink-300 text-[10px] text-ink-300">
            None
          </div>
        )}

        <div className="min-w-0 flex-1">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-card border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-900 disabled:opacity-40"
          >
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>

          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="…or paste an image URL"
            className="mt-2 w-full rounded-card border border-ink-300 px-3 py-2 text-sm focus:border-ink-950 focus:outline-none"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
