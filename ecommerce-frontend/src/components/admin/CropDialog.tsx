import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/Spinner';
import { Minus, Plus } from 'lucide-react';

/**
 * Choosing which part of a picture survives.
 *
 * Every image in this product is shown with `object-cover` into a frame whose
 * shape the shopkeeper never sees — a portrait photo dropped into a square
 * product tile loses its top and bottom, and a banner uploaded as a square is
 * shown as a letterbox slice through its middle. The browser centre-crops, and
 * the middle of a photograph is very often not the subject of it.
 *
 * So the crop is decided here, once, against a frame the exact shape of where
 * the image is going, and what gets uploaded is already that shape. Downstream
 * `object-cover` then has nothing left to cut.
 *
 * The alternative — storing a focal point and setting `object-position`
 * everywhere — was not taken: it leaves full-size images on the wire, and every
 * new surface has to remember to honour a field it cannot see.
 */

export interface CropSpec {
  /** width / height of the frame this image lands in. */
  ratio: number;
  /** The longest edge to write out. Never upscales past the source. */
  maxWidth: number;
  /** Shown above the frame, so the shopkeeper knows what they are aiming at. */
  hint: string;
}

/** How far in you can push before a photograph turns to porridge. */
const MAX_ZOOM = 4;

export function CropDialog({
  file,
  spec,
  onCancel,
  onCropped,
}: {
  file: File;
  spec: CropSpec;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  /**
   * A measurement of the frame, kept only to force a re-render.
   *
   * The scale is read live off the element (see `frame`), because a *stored*
   * size can go stale — and a stale one is not a cosmetic problem here: the
   * export samples `frame().w / scale` pixels out of the source, so if the
   * stored width no longer matches the element, the file that is written is not
   * the picture that was positioned.
   *
   * State is still needed, because reading the element during the first render
   * gives zero — nothing has been laid out yet — and without a state change
   * nothing would ever render again to correct it. That was the original bug:
   * the image was sized 0x0 and simply never appeared.
   */
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  /** 1 is "just covers the frame"; larger crops in tighter. */
  const [zoom, setZoom] = useState(1);
  /** The image's top-left, in frame pixels. Always negative or zero. */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /**
   * `createImageBitmap` with `imageOrientation: 'from-image'`.
   *
   * A photo off a phone carries its rotation in EXIF. An `<img>` applies that
   * for display, but a canvas drawn from a raw decode does not — so without
   * this the preview stands upright and the file that gets uploaded is on its
   * side, which is the sort of bug that is only ever found by a customer.
   */
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setPreview(url);

    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((bmp) => {
        if (cancelled) bmp.close();
        else setBitmap(bmp);
      })
      .catch(() => !cancelled && setFailed('That image could not be read.'));

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  /**
   * `useLayoutEffect`, so the first measurement happens before the browser
   * paints and the image is never shown at the wrong size for a frame.
   *
   * Three ways of noticing a change, because none of them is reliable alone: a
   * measurement on mount, the window resize that accompanies most frame
   * changes, and a ResizeObserver for the ones it does not — a scrollbar
   * appearing, the dialog reflowing. The observer is *optional*: it is absent
   * in jsdom and was silently inert in the browser this was verified in, which
   * is exactly why the live read below is what the maths actually uses.
   */
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    const measure = () => setFrameSize({ w: el.clientWidth, h: el.clientHeight });
    measure();

    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);

    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  /**
   * The element's size now, falling back to the last measurement.
   *
   * Live rather than stored: what is drawn and what is exported are then
   * computed from the same number, whatever has happened to the layout since.
   */
  const frame = () => {
    const el = frameRef.current;
    return el && el.clientWidth ? { w: el.clientWidth, h: el.clientHeight } : frameSize;
  };

  /** The scale at which the image exactly covers the frame. */
  const coverScale = () => {
    if (!bitmap) return 1;
    const f = frame();
    return Math.max(f.w / bitmap.width, f.h / bitmap.height);
  };

  /**
   * Keeps the frame full.
   *
   * Dragging is clamped rather than sprung back, so the image cannot be pulled
   * away from an edge to leave a strip of background that would be uploaded as
   * part of the picture.
   */
  const clamp = (next: { x: number; y: number }, atZoom = zoom) => {
    if (!bitmap) return { x: 0, y: 0 };
    const f = frame();
    const s = coverScale() * atZoom;
    const w = bitmap.width * s;
    const h = bitmap.height * s;
    return {
      x: Math.min(0, Math.max(f.w - w, next.x)),
      y: Math.min(0, Math.max(f.h - h, next.y)),
    };
  };

  /** Zooms about the centre of the frame, not the top-left corner. */
  const setZoomAbout = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const f = frame();
    const ratio = z / zoom;
    const centred = {
      x: f.w / 2 - (f.w / 2 - offset.x) * ratio,
      y: f.h / 2 - (f.h / 2 - offset.y) * ratio,
    };
    setZoom(z);
    setOffset(clamp(centred, z));
  };

  const confirm = async () => {
    if (!bitmap) return;
    setWorking(true);
    try {
      const f = frame();
      const s = coverScale() * zoom;

      // The visible window, back in the source image's own pixels.
      const sx = -offset.x / s;
      const sy = -offset.y / s;
      const sw = f.w / s;
      const sh = f.h / s;

      // Never enlarge: a 300px logo blown up to 2000px is a blurry 2000px logo.
      const outW = Math.round(Math.min(spec.maxWidth, sw));
      const outH = Math.round(outW / spec.ratio);

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);

      /**
       * PNG for anything that may be transparent, JPEG otherwise.
       *
       * Re-encoding a transparent PNG as JPEG fills the transparency with
       * black, which turns a logo meant for a white header into a black slab.
       */
      const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, keepAlpha ? 'image/png' : 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('could not encode');

      const name = file.name.replace(/\.[^.]+$/, '') + (keepAlpha ? '.png' : '.jpg');
      onCropped(new File([blob], name, { type: blob.type }));
    } catch {
      setFailed('That image could not be cropped. Try a different file.');
      setWorking(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Position the image"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-card bg-white shadow-dialog">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink-950">
            Position the image
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">{spec.hint}</p>
        </div>

        <div className="p-5">
          {failed ? (
            <p role="alert" className="rounded-card bg-red-50 px-4 py-3 text-sm text-red-800">
              {failed}
            </p>
          ) : (
            <>
              {/* Everything outside this frame is what gets thrown away, which
                  is why it is the only lit part of the dialog. */}
              <div
                ref={frameRef}
                style={{ aspectRatio: String(spec.ratio) }}
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  setOffset(
                    clamp({
                      x: drag.current.ox + (e.clientX - drag.current.x),
                      y: drag.current.oy + (e.clientY - drag.current.y),
                    }),
                  );
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onWheel={(e) => setZoomAbout(zoom - e.deltaY * 0.002)}
                className="relative w-full cursor-move touch-none select-none overflow-hidden rounded-card bg-ink-100"
              >
                {preview && bitmap && (
                  <img
                    src={preview}
                    alt=""
                    draggable={false}
                    style={{
                      width: bitmap.width * coverScale() * zoom,
                      height: bitmap.height * coverScale() * zoom,
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                    }}
                    className="max-w-none origin-top-left"
                  />
                )}
                {!bitmap && !failed && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Spinner size={18} label="Uploading" />
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setZoomAbout(zoom - 0.25)}
                  aria-label="Zoom out"
                  className="rounded-card border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-50"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  aria-label="Zoom"
                  onChange={(e) => setZoomAbout(Number(e.target.value))}
                  className="h-1 flex-1 cursor-pointer accent-brand"
                />
                <button
                  type="button"
                  onClick={() => setZoomAbout(zoom + 0.25)}
                  aria-label="Zoom in"
                  className="rounded-card border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-50"
                >
                  <Plus size={14} />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-ink-400">
                Drag to move it. Everything outside the frame is trimmed off.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-card border border-ink-200 px-4 py-2 text-sm text-ink-800 hover:bg-ink-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!bitmap || working || Boolean(failed)}
            onClick={() => void confirm()}
            className="rounded-card bg-brand px-4 py-2 text-sm font-medium text-white shadow-glow-sm transition-colors hover:bg-brand/90 disabled:pointer-events-none disabled:opacity-40"
          >
            {working ? 'Working…' : 'Use this'}
          </button>
        </div>
      </div>
    </div>
  );
}
