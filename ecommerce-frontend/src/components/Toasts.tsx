import { create } from 'zustand';
import { useEffect } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

/**
 * Transient confirmations, in the corner.
 *
 * Replaces the inline "Saved" text that used to sit beside a submit button.
 * Inline confirmation has two problems: on a long form it appears wherever the
 * button happens to be — often below the fold after a scroll — and it competes
 * for space with the validation errors that use the same spot. A corner popup is
 * in the same place every time, so it is somewhere to look rather than something
 * to find.
 *
 * A store rather than context: mutations report success from callbacks that have
 * no component around them, and threading a hook through every one of those is
 * how confirmations end up being skipped.
 */

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

/** How long each tone stays. An error is read; a confirmation is glanced at. */
const DURATION: Record<ToastTone, number> = {
  success: 3200,
  info: 4000,
  // Errors do not auto-dismiss. A failure the reader missed is a failure they
  // will assume was a success.
  error: 0,
};

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    // Capped so a mutation stuck in a retry loop cannot fill the screen; the
    // oldest goes, because the newest is the one being reacted to.
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-4) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** The three helpers everything actually calls. */
export const toast = {
  saved: (title = 'Saved', detail?: string) =>
    useToasts.getState().push({ tone: 'success', title, detail }),
  error: (title: string, detail?: string) =>
    useToasts.getState().push({ tone: 'error', title, detail }),
  info: (title: string, detail?: string) =>
    useToasts.getState().push({ tone: 'info', title, detail }),
};

/**
 * Pulls a readable message out of whatever a mutation rejected with.
 *
 * The API's own reason beats a generic one — it distinguishes "that slug is
 * taken" from "storage is down" — and every error shape in this app puts it on
 * `message`.
 */
export function toastFromError(error: unknown, fallback = 'Something went wrong'): number {
  const e = error as { message?: string; details?: string[] } | null;
  return toast.error(e?.message ?? fallback, e?.details?.join(' · '));
}

const TONE: Record<ToastTone, { icon: typeof Check; ring: string; iconClass: string }> = {
  success: { icon: Check, ring: 'ring-green-600/20', iconClass: 'bg-green-50 text-green-700' },
  error: { icon: AlertTriangle, ring: 'ring-red-600/20', iconClass: 'bg-red-50 text-red-700' },
  info: { icon: Info, ring: 'ring-blue-600/20', iconClass: 'bg-blue-50 text-blue-700' },
};

/**
 * Mounted once per app shell.
 *
 * `aria-live="polite"` rather than `assertive`: a save confirmation should not
 * interrupt what a screen reader is already saying, and the region is
 * always present so an insertion is announced rather than the container arriving.
 */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:items-end sm:p-6"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const duration = DURATION[t.tone];

  useEffect(() => {
    if (duration === 0) return;
    const timer = window.setTimeout(() => dismiss(t.id), duration);
    return () => window.clearTimeout(timer);
  }, [t.id, duration, dismiss]);

  const { icon: Icon, ring, iconClass } = TONE[t.tone];

  return (
    <div
      role={t.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-white p-3.5 shadow-raised ring-1 ${ring} animate-rise-in`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-950">{t.title}</p>
        {t.detail && <p className="mt-0.5 break-words text-xs text-ink-500">{t.detail}</p>}
      </div>

      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 rounded p-1 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
      >
        <X size={14} />
      </button>
    </div>
  );
}
