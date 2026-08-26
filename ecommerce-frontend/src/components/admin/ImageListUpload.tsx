import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Upload, X } from 'lucide-react';
import { mediaService } from '@/services/admin.service';
import type { ApiError } from '@/types/api';

/**
 * An ordered list of image URLs, for products.
 *
 * Order is the point of the arrows rather than a nicety: the storefront and the
 * admin list both show `images[0]`, so which image is first *is* the product's
 * thumbnail. Reordering by dragging would be better; arrows work with a
 * keyboard and on a phone, which dragging does not without real work.
 */
export function ImageListUpload({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');

  const add = (url: string) => {
    const trimmed = url.trim();
    // Silently ignoring a duplicate is right: it is almost always a double
    // click, and a warning for it would be noise.
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setUploading(true);

    // Sequential, not Promise.all: a shopkeeper adding eight photos from a
    // phone should not open eight concurrent uploads on a slow connection.
    const added: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const stored = await mediaService.upload(file, 'product');
        added.push(stored.url);
      }
    } catch (e) {
      setError((e as ApiError).message ?? 'That file could not be uploaded.');
    } finally {
      // Whatever succeeded before the failure is kept — re-uploading images
      // that already worked is a poor way to recover from one bad file.
      if (added.length) onChange([...value, ...added.filter((u) => !value.includes(u))]);
      setUploading(false);
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
      {value.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-3">
          {value.map((url, index) => (
            <li key={url} className="relative">
              <img
                src={url}
                alt=""
                className="h-24 w-24 rounded-card border border-ink-100 object-cover"
              />

              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-ink-950/80 px-1.5 py-0.5 text-[10px] text-white">
                  Main
                </span>
              )}

              <button
                type="button"
                onClick={() => onChange(value.filter((u) => u !== url))}
                aria-label="Remove image"
                className="absolute -right-2 -top-2 rounded-full bg-ink-950 p-1 text-white"
              >
                <X size={12} />
              </button>

              <div className="mt-1 flex justify-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move image earlier"
                  className="rounded border border-ink-200 p-0.5 text-ink-500 disabled:opacity-30"
                >
                  <ArrowLeft size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="Move image later"
                  className="rounded border border-ink-200 p-0.5 text-ink-500 disabled:opacity-30"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => void pick(e.target.files)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-2 rounded-card border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-900 disabled:opacity-40"
        >
          <Upload size={14} />
          {uploading ? 'Uploading…' : 'Upload images'}
        </button>

        <input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          onKeyDown={(e) => {
            // Enter inside a form would submit the product; this field is for
            // adding a URL, so it handles the key itself.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            add(pasted);
            setPasted('');
          }}
          placeholder="…or paste an image URL and press Enter"
          className="min-w-0 flex-1 rounded-card border border-ink-300 px-3 py-2 text-sm focus:border-ink-950 focus:outline-none"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
