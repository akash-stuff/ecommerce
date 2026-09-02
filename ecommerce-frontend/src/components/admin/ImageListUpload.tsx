import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Loader2, Upload, X } from 'lucide-react';
import { mediaService } from '@/services/admin.service';
import { ASPECTS } from './ImageUpload';
import { CropDialog } from './CropDialog';
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  /** Files waiting to be positioned. The head of it is in the dialog. */
  const [queue, setQueue] = useState<File[]>([]);

  const add = (url: string) => {
    const trimmed = url.trim();
    // Silently ignoring a duplicate is right: it is almost always a double
    // click, and a warning for it would be noise.
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
  };

  /**
   * Picked files are queued and positioned one at a time.
   *
   * Product tiles are square everywhere — the grid, the detail page, the cart —
   * and a photograph off a phone is not, so something has to decide which part
   * of it survives. Left to `object-cover` that decision is "the middle", which
   * is where the subject of a photograph very often is not.
   *
   * One dialog per file is deliberately a little tedious for a batch of eight.
   * The alternative is a centre crop nobody chose, and the tedium is the price
   * of the shopkeeper seeing each tile before it goes live.
   *
   * A GIF skips the queue: drawing one through a canvas would flatten it to a
   * single still frame.
   */
  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);

    const picked = Array.from(files);
    const animated = picked.filter((f) => f.type === 'image/gif');
    const still = picked.filter((f) => f.type !== 'image/gif');

    if (animated.length) void uploadAll(animated);
    if (still.length) setQueue(still);
    if (input.current) input.current.value = '';
  };

  /**
   * Sequential, not Promise.all: a shopkeeper adding eight photos from a phone
   * should not open eight concurrent uploads on a slow connection.
   */
  const uploadAll = async (files: File[]) => {
    setUploading(true);
    setProgress({ done: 0, total: files.length });

    const added: string[] = [];
    try {
      for (const file of files) {
        const stored = await mediaService.upload(file, 'product');
        added.push(stored.url);
        setProgress({ done: added.length, total: files.length });
      }
    } catch (e) {
      setError((e as ApiError).message ?? 'That file could not be uploaded.');
    } finally {
      // Whatever succeeded before the failure is kept — re-uploading images
      // that already worked is a poor way to recover from one bad file.
      if (added.length) onChange([...value, ...added.filter((u) => !value.includes(u))]);
      setUploading(false);
      setProgress(null);
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
        onChange={(e) => pick(e.target.files)}
      />

      {/* One at a time, off the head of the queue. Cancelling skips that file
          and moves to the next rather than abandoning the whole batch — the
          usual reason to cancel is one bad photo among several good ones. */}
      {queue.length > 0 && (
        <CropDialog
          key={`${queue[0].name}-${queue.length}`}
          file={queue[0]}
          spec={{
            ...ASPECTS.product,
            hint:
              queue.length > 1
                ? `${ASPECTS.product.hint} ${queue.length} left to position.`
                : ASPECTS.product.hint,
          }}
          onCancel={() => setQueue((q) => q.slice(1))}
          onCropped={(cropped) => {
            setQueue((q) => q.slice(1));
            void uploadAll([cropped]);
          }}
        />
      )}

      {value.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-3">
          {value.map((url, index) => (
            <li key={url} className="group relative">
              <img
                src={url}
                alt=""
                className="h-24 w-24 rounded-card border border-ink-100 bg-ink-50 object-cover"
              />

              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-ink-950/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Main
                </span>
              )}

              <button
                type="button"
                onClick={() => onChange(value.filter((u) => u !== url))}
                aria-label="Remove image"
                className="absolute -right-2 -top-2 rounded-full bg-ink-950 p-1 text-white shadow-card transition-transform hover:scale-110"
              >
                <X size={12} />
              </button>

              <div className="mt-1 flex justify-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move image earlier"
                  className="rounded border border-ink-200 p-0.5 text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-30"
                >
                  <ArrowLeft size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label="Move image later"
                  className="rounded border border-ink-200 p-0.5 text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-30"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-card border border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? 'border-ink-950 bg-ink-50' : 'border-ink-200 bg-white hover:border-ink-300'
        }`}
      >
        {uploading ? (
          <>
            <Loader2 size={18} className="animate-spin text-ink-400" />
            <p className="numeric mt-2 text-xs text-ink-500">
              {progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : 'Uploading…'}
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
              or drop them here · the first image is the thumbnail
            </p>
          </>
        )}
      </div>

      {showUrl ? (
        <input
          value={pasted}
          autoFocus
          onChange={(e) => setPasted(e.target.value)}
          onBlur={() => !pasted && setShowUrl(false)}
          onKeyDown={(e) => {
            // Enter inside a form would submit the product; this field is for
            // adding a URL, so it handles the key itself.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            add(pasted);
            setPasted('');
          }}
          placeholder="Paste an image URL and press Enter"
          className="mt-2 w-full rounded-card border border-ink-200 px-3 py-1.5 text-sm transition-colors focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowUrl(true)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-ink-500 transition-colors hover:text-ink-950"
        >
          <Link2 size={12} />
          Add an image by URL instead
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
